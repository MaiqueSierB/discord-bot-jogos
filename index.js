import {
    Client, Events, GatewayIntentBits,
    EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';

import db from "./db.js";
import config from './config.js';
import { searchGame, getGameDetails } from './rawg.js';

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ===== UTILITÁRIO: BARRA DE XP =====
function criarBarraXp(xp, level) {
    const max = level * 500;
    const progresso = Math.min(xp / max, 1);
    const total = 10;
    const filled = Math.round(progresso * total);

    return "🟩".repeat(filled) + "⬜".repeat(total - filled) + ` (${xp}/${max})`;
}

client.once(Events.ClientReady, c => {
    console.log(`🎮 Bot RGDB Online! Logado como ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
    try {

        // ================= SISTEMA DE BOTÕES =================
        if (interaction.isButton()) {

            // Escolha do jogo após a busca
            if (interaction.customId.startsWith('jogo_escolha_')) {
                const id = interaction.customId.split('_')[2];
                const game = await getGameDetails(id);

                const embed = new EmbedBuilder()
                    .setTitle(game.name)
                    .setDescription(game.description_raw?.slice(0, 500) || "Sem descrição disponível.")
                    .setThumbnail(game.background_image)
                    .setColor(0x5865F2);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`avaliar_jogo_${id}`)
                        .setLabel('Avaliar este Jogo')
                        .setStyle(ButtonStyle.Success)
                );

                await interaction.update({ embeds: [embed], components: [row] });
            }

            // Abrir formulário de nota
            if (interaction.customId.startsWith('avaliar_jogo_')) {
                const id = interaction.customId.split('_')[2];
                const modal = new ModalBuilder()
                    .setCustomId(`modal_${id}`)
                    .setTitle('Sua Avaliação');

                const notaInput = new TextInputBuilder()
                    .setCustomId('nota')
                    .setLabel('Qual nota você dá? (0 a 10)')
                    .setPlaceholder('Exemplo: 9.5')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(notaInput));
                await interaction.showModal(modal);
            }

            // Processamento de XP e Status
            if (interaction.customId.startsWith('xp_')) {
                const [_, tipo, gameId, notaStr] = interaction.customId.split('_');
                const userId = interaction.user.id;
                const username = interaction.user.username;
                
                let score = parseFloat(notaStr.replace(',', '.'));
                if (isNaN(score)) score = 0;
                score = Math.max(0, Math.min(10, score));

                // Lógica de atribuição de XP
                let gainXp = 0;
                let statusMsg = "";
                if (tipo === 'joguei') { gainXp = 25; statusMsg = "Apenas Joguei"; }
                else if (tipo === 'zerou') { gainXp = 50; statusMsg = "Zerou o Jogo"; }
                else if (tipo === '100') { gainXp = 200; statusMsg = "Platinou/100%"; }

                // 1. Regista o voto individual
                db.prepare(`
                    INSERT INTO votos_jogos (game_id, user_id, username, score) 
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(game_id, user_id) DO UPDATE SET score=excluded.score
                `).run(gameId, userId, username, score);

                // 2. Calcula a nova média do servidor
                const stats = db.prepare(`SELECT AVG(score) as avg, COUNT(*) as total FROM votos_jogos WHERE game_id=?`).get(gameId);
                const game = await getGameDetails(gameId);

                // 3. Atualiza a biblioteca global do servidor
                db.prepare(`
                    INSERT INTO avaliacoes_jogos (game_id, title, server_score, vote_count) 
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(game_id) DO UPDATE SET
                    server_score=excluded.server_score,
                    vote_count=excluded.vote_count
                `).run(gameId, game.name, stats.avg, stats.total);

                // 4. Atualiza XP do Usuário
                const user = db.prepare(`SELECT * FROM usuarios WHERE user_id=?`).get(userId);
                let totalXp = (user?.xp || 0) + gainXp;
                let level = user?.level || 1;

                while (totalXp >= level * 500) {
                    totalXp -= (level * 500);
                    level++;
                }

                db.prepare(`
                    INSERT INTO usuarios (user_id, username, xp, level) VALUES (?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET xp=?, level=?, username=?
                `).run(userId, username, totalXp, level, totalXp, level, username);

                await interaction.update({
                    content: `✅ **${statusMsg}** registado! Ganhaste **+${gainXp} XP** | Nível Atual: **${level}**`,
                    embeds: [],
                    components: []
                });
            }
            return;
        }

        // ================= SISTEMA DE FORMULÁRIOS (MODAL) =================
        if (interaction.isModalSubmit()) {
            const gameId = interaction.customId.split('_')[1];
            const nota = interaction.fields.getTextInputValue('nota');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`xp_joguei_${gameId}_${nota}`)
                    .setLabel('🎮 Apenas Joguei (+25 XP)')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`xp_zerou_${gameId}_${nota}`)
                    .setLabel('🚩 Zerou (+50 XP)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`xp_100_${gameId}_${nota}`)
                    .setLabel('💯 100% / Platina (+200 XP)')
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.reply({
                content: `Recebido! Tu deste nota **${nota}**. Qual o teu progresso no jogo?`,
                components: [row],
                ephemeral: true
            });
            return;
        }

        // ================= COMANDOS DE TEXTO (SLASH) =================
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            // COMANDO: JOGO (BUSCA)
            if (commandName === 'jogo') {
                await interaction.deferReply();
                const nome = interaction.options.getString('titulo');
                const results = await searchGame(nome);

                if (!results || results.length === 0) return interaction.editReply("❌ Não encontrei nenhum jogo com esse nome.");

                const embed = new EmbedBuilder()
                    .setTitle(`Pesquisa: ${nome}`)
                    .setDescription(results.slice(0, 5).map((g, i) => `**${i + 1}.** ${g.name}`).join('\n'))
                    .setColor(0x5865F2);

                const row = new ActionRowBuilder().addComponents(
                    results.slice(0, 5).map((g, i) =>
                        new ButtonBuilder()
                            .setCustomId(`jogo_escolha_${g.id}`)
                            .setLabel(`${i + 1}`)
                            .setStyle(ButtonStyle.Secondary)
                    )
                );
                await interaction.editReply({ embeds: [embed], components: [row] });
            }

            // COMANDO: JOGOS AVALIADOS
            if (commandName === 'jogosavaliados') {
                await interaction.deferReply();
                const jogos = db.prepare(`SELECT title, server_score, vote_count FROM avaliacoes_jogos ORDER BY server_score DESC`).all();
                
                if (!jogos.length) return interaction.editReply("A biblioteca está vazia. Comecem a avaliar jogos!");

                const lista = jogos.map(j => `⭐ **${j.server_score.toFixed(1)}** | ${j.title} (${j.vote_count} votos)`).join('\n');
                const embed = new EmbedBuilder()
                    .setTitle("📚 Biblioteca do Servidor")
                    .setDescription(lista.slice(0, 4000))
                    .setColor(0xFFD700);
                
                await interaction.editReply({ embeds: [embed] });
            }

            // COMANDO: REMOVER JOGO (NOVO)
            if (commandName === 'removerjogo') {
                await interaction.deferReply();
                const titulo = interaction.options.getString('titulo');

                // Tenta encontrar o jogo pelo título exato na nossa base
                const jogo = db.prepare(`SELECT game_id, title FROM avaliacoes_jogos WHERE title LIKE ?`).get(`%${titulo}%`);

                if (!jogo) return interaction.editReply(`❌ Não encontrei "${titulo}" na nossa lista de avaliados.`);

                // Remove da tabela de avaliações e todos os votos associados
                db.prepare(`DELETE FROM avaliacoes_jogos WHERE game_id = ?`).run(jogo.game_id);
                db.prepare(`DELETE FROM votos_jogos WHERE game_id = ?`).run(jogo.game_id);

                await interaction.editReply(`🗑️ O jogo **${jogo.title}** foi removido da biblioteca com sucesso.`);
            }

            // COMANDO: PERFIL
            if (commandName === 'perfil') {
                await interaction.deferReply();
                const target = interaction.options.getUser('usuario') || interaction.user;
                const stats = db.prepare(`SELECT xp, level FROM usuarios WHERE user_id=?`).get(target.id);
                
                const xp = stats?.xp || 0;
                const lvl = stats?.level || 1;
                const barra = criarBarraXp(xp, lvl);
                
                const embed = new EmbedBuilder()
                    .setTitle(`Perfil de ${target.username}`)
                    .setThumbnail(target.displayAvatarURL())
                    .addFields(
                        { name: "🏆 Nível", value: lvl.toString(), inline: true },
                        { name: "✨ Experiência", value: barra }
                    )
                    .setColor(0x00AE86);
                await interaction.editReply({ embeds: [embed] });
            }

            // COMANDO: RANKING
            if (commandName === 'ranking') {
                await interaction.deferReply();
                const top = db.prepare(`SELECT username, xp, level FROM usuarios ORDER BY level DESC, xp DESC LIMIT 10`).all();
                
                if (!top.length) return interaction.editReply("Ninguém ganhou XP ainda.");
                
                const texto = top.map((u, i) => `**${i + 1}.** ${u.username} — Lvl ${u.level} (${u.xp} XP)`).join("\n");
                const embed = new EmbedBuilder().setTitle("🏆 Top Jogadores do Servidor").setDescription(texto).setColor(0xF1C40F);
                await interaction.editReply({ embeds: [embed] });
            }

            // COMANDO: RECOMENDAÇÃO INTELIGENTE
            if (commandName === 'recomendacaointeligente') {
                await interaction.deferReply();
                const userId = interaction.user.id;
                
                const topGame = db.prepare(`
                    SELECT title, server_score 
                    FROM avaliacoes_jogos 
                    WHERE game_id NOT IN (SELECT game_id FROM votos_jogos WHERE user_id = ?)
                    ORDER BY server_score DESC LIMIT 1
                `).get(userId);

                if (!topGame) return interaction.editReply("✨ Já avaliaste todos os jogos da biblioteca ou ela está vazia!");

                const embed = new EmbedBuilder()
                    .setTitle("🧠 Dica Personalizada")
                    .setDescription(`Baseado nas notas do servidor, tu devias experimentar:\n\n🔥 **${topGame.title}**\n⭐ Média Global: \`${topGame.server_score.toFixed(1)}\``)
                    .setColor(0x9B59B6);
                await interaction.editReply({ embeds: [embed] });
            }
        }
    } catch (err) {
        console.error("❌ ERRO NO BOT:", err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "Houve um erro técnico. Tenta novamente mais tarde.", ephemeral: true }).catch(() => {});
        }
    }
});

client.login(config.token);