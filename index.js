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

// ===== UTILITÁRIO: BARRA XP =====
function criarBarraXp(xp, level) {
    const max = level * 500;
    const progresso = Math.min(xp / max, 1);
    const total = 10;
    const filled = Math.round(progresso * total);

    return "🟩".repeat(filled) + "⬜".repeat(total - filled) + ` (${xp}/${max})`;
}

client.once(Events.ClientReady, c => {
    console.log(`🎮 Bot online como ${c.user.tag} no Railway!`);
});

client.on(Events.InteractionCreate, async interaction => {
    try {

        // ================= BOTÕES =================
        if (interaction.isButton()) {

            if (interaction.customId.startsWith('jogo_escolha_')) {
                const id = interaction.customId.split('_')[2];
                const game = await getGameDetails(id);

                const embed = new EmbedBuilder()
                    .setTitle(game.name)
                    .setDescription(game.description_raw?.slice(0, 500) || "Sem descrição")
                    .setThumbnail(game.background_image)
                    .setColor(0x5865F2);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`avaliar_jogo_${id}`)
                        .setLabel('Dar nota')
                        .setStyle(ButtonStyle.Success)
                );

                await interaction.update({ embeds: [embed], components: [row] });
            }

            if (interaction.customId.startsWith('avaliar_jogo_')) {
                const id = interaction.customId.split('_')[2];
                const modal = new ModalBuilder()
                    .setCustomId(`modal_${id}`)
                    .setTitle('Avaliar jogo');

                const notaInput = new TextInputBuilder()
                    .setCustomId('nota')
                    .setLabel('Nota (0-10)')
                    .setPlaceholder('Ex: 8.5')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(notaInput));
                await interaction.showModal(modal);
            }

            if (interaction.customId.startsWith('xp_')) {
                const [_, tipo, gameId, notaStr] = interaction.customId.split('_');
                const userId = interaction.user.id;
                const username = interaction.user.tag;
                
                let score = parseFloat(notaStr.replace(',', '.'));
                if (isNaN(score)) score = 0;
                score = Math.max(0, Math.min(10, score));

                let gainXp = tipo === 'zerou' ? 50 : 200;

                // 1. Salvar voto individual
                db.prepare(`
                    INSERT INTO votos_jogos (game_id, user_id, username, score) 
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(game_id, user_id) DO UPDATE SET score=excluded.score
                `).run(gameId, userId, username, score);

                // 2. Média do jogo
                const stats = db.prepare(`SELECT AVG(score) as avg, COUNT(*) as total FROM votos_jogos WHERE game_id=?`).get(gameId);
                const game = await getGameDetails(gameId);

                // 3. Atualizar biblioteca global
                db.prepare(`
                    INSERT INTO avaliacoes_jogos (game_id, title, server_score, vote_count) 
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(game_id) DO UPDATE SET
                    server_score=excluded.server_score,
                    vote_count=excluded.vote_count
                `).run(gameId, game.name, stats.avg, stats.total);

                // 4. Evolução de XP
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
                    content: `✅ Avaliação salva! **+${gainXp} XP** | 🏆 Nível **${level}**`,
                    embeds: [],
                    components: []
                });
            }
            return;
        }

        // ================= MODAL =================
        if (interaction.isModalSubmit()) {
            const gameId = interaction.customId.split('_')[1];
            const nota = interaction.fields.getTextInputValue('nota');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`xp_zerou_${gameId}_${nota}`)
                    .setLabel('🎮 Zerou (+50 XP)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`xp_100_${gameId}_${nota}`)
                    .setLabel('💯 100% (+200 XP)')
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.reply({
                content: `Você deu nota **${nota}**! Como foi sua jornada?`,
                components: [row],
                ephemeral: true
            });
            return;
        }

        // ================= COMANDOS SLASH =================
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            if (commandName === 'jogo') {
                await interaction.deferReply();
                const nome = interaction.options.getString('titulo');
                const results = await searchGame(nome);

                if (!results || results.length === 0) return interaction.editReply("❌ Nada encontrado.");

                const embed = new EmbedBuilder()
                    .setTitle(`Resultados para: ${nome}`)
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

            if (commandName === 'jogosavaliados') {
                await interaction.deferReply();
                const jogos = db.prepare(`SELECT title, server_score, vote_count FROM avaliacoes_jogos ORDER BY server_score DESC`).all();
                if (!jogos.length) return interaction.editReply("Biblioteca vazia.");

                const lista = jogos.map(j => `⭐ **${j.server_score.toFixed(1)}** | ${j.title} (${j.vote_count} votos)`).join('\n');
                const embed = new EmbedBuilder().setTitle("📚 Biblioteca do Servidor").setDescription(lista.slice(0, 4000)).setColor(0xFFD700);
                await interaction.editReply({ embeds: [embed] });
            }

            if (commandName === 'perfil') {
                await interaction.deferReply();
                const target = interaction.options.getUser('usuario') || interaction.user;
                const stats = db.prepare(`SELECT xp, level FROM usuarios WHERE user_id=?`).get(target.id);
                const barra = criarBarraXp(stats?.xp || 0, stats?.level || 1);
                
                const embed = new EmbedBuilder()
                    .setTitle(`Perfil de ${target.username}`)
                    .setThumbnail(target.displayAvatarURL())
                    .addFields({ name: "🏆 Nível", value: (stats?.level || 1).toString(), inline: true }, { name: "✨ Progresso", value: barra })
                    .setColor(0x00AE86);
                await interaction.editReply({ embeds: [embed] });
            }

            if (commandName === 'ranking') {
                await interaction.deferReply();
                const top = db.prepare(`SELECT username, xp, level FROM usuarios ORDER BY level DESC, xp DESC LIMIT 10`).all();
                if (!top.length) return interaction.editReply("Ranking vazio.");
                const texto = top.map((u, i) => `**${i + 1}.** ${u.username} — Lvl ${u.level} (${u.xp} XP)`).join("\n");
                const embed = new EmbedBuilder().setTitle("🏆 Top Jogadores").setDescription(texto).setColor(0xF1C40F);
                await interaction.editReply({ embeds: [embed] });
            }

            if (commandName === 'recomendacaointeligente') {
                await interaction.deferReply();
                const userId = interaction.user.id;
                
                // Busca o jogo melhor avaliado que o usuário atual ainda não votou
                const topGame = db.prepare(`
                    SELECT title, server_score 
                    FROM avaliacoes_jogos 
                    WHERE game_id NOT IN (SELECT game_id FROM votos_jogos WHERE user_id = ?)
                    ORDER BY server_score DESC LIMIT 1
                `).get(userId);

                if (!topGame) return interaction.editReply("✨ Você já avaliou todos os jogos ou não há novos dados!");

                const embed = new EmbedBuilder()
                    .setTitle("🧠 Dica de Mestre")
                    .setDescription(`Baseado na galera, mas que você **ainda não avaliou**: \n\n🔥 **${topGame.title}**\n⭐ Média: \`${topGame.server_score.toFixed(1)}\``)
                    .setColor(0x9B59B6);
                await interaction.editReply({ embeds: [embed] });
            }
        }
    } catch (err) {
        console.error("ERRO CRÍTICO:", err);
    }
});

client.login(config.token);