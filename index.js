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

// ===== BARRA XP =====
function criarBarraXp(xp, level) {
    const max = level * 500;
    const progresso = Math.min(xp / max, 1);
    const total = 10;
    const filled = Math.round(progresso * total);

    return "🟩".repeat(filled) + "⬜".repeat(total - filled) + ` (${xp}/${max})`;
}

client.once(Events.ClientReady, c => {
    console.log(`🎮 Bot online como ${c.user.tag}`);
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
                    .setThumbnail(game.background_image);

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
                    .setStyle(TextInputStyle.Short);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(notaInput)
                );

                await interaction.showModal(modal);
            }

            if (interaction.customId.startsWith('xp_')) {

                const [_, tipo, gameId, nota] = interaction.customId.split('_');

                const userId = interaction.user.id;
                const username = interaction.user.tag;
                const score = parseFloat(nota);

                let xp = tipo === 'zerou' ? 50 : 200;

                db.prepare(`
                    INSERT INTO votos_jogos VALUES (?, ?, ?, ?)
                    ON CONFLICT(game_id, user_id) DO UPDATE SET score=excluded.score
                `).run(gameId, userId, username, score);

                const stats = db.prepare(`
                    SELECT AVG(score) avg, COUNT(*) total FROM votos_jogos WHERE game_id=?
                `).get(gameId);

                const game = await getGameDetails(gameId);

                db.prepare(`
                    INSERT INTO avaliacoes_jogos VALUES (?, ?, ?, ?)
                    ON CONFLICT(game_id) DO UPDATE SET
                    server_score=excluded.server_score,
                    vote_count=excluded.vote_count
                `).run(gameId, game.name, stats.avg, stats.total);

                const user = db.prepare(`SELECT * FROM usuarios WHERE user_id=?`).get(userId);

                let totalXp = user ? user.xp : 0;
                let level = user ? user.level : 1;

                totalXp += xp;

                if (totalXp >= level * 500) level++;

                db.prepare(`
                    INSERT INTO usuarios VALUES (?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET xp=?, level=?
                `).run(userId, username, totalXp, level, totalXp, level);

                await interaction.update({
                    content: `🎮 +${xp} XP | 🏆 Nível ${level}`,
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
                content: "Escolha como você completou:",
                components: [row],
                ephemeral: true
            });

            return;
        }

        // ================= COMANDOS =================
        if (interaction.isChatInputCommand()) {

            const { commandName } = interaction;

            // ===== BUSCAR JOGO =====
            if (commandName === 'jogo') {

                await interaction.deferReply();

                const nome = interaction.options.getString('titulo');
                const results = await searchGame(nome);

                const embed = new EmbedBuilder()
                    .setTitle("Resultados")
                    .setDescription(results.slice(0, 5).map((g,i)=>`${i+1}. ${g.name}`).join('\n'));

                const row = new ActionRowBuilder().addComponents(
                    results.slice(0,5).map((g,i)=>
                        new ButtonBuilder()
                        .setCustomId(`jogo_escolha_${g.id}`)
                        .setLabel(`${i+1}`)
                        .setStyle(ButtonStyle.Primary)
                    )
                );

                await interaction.editReply({ embeds:[embed], components:[row] });
            }

            // ===== PERFIL =====
            if (commandName === 'perfil') {

                await interaction.deferReply();

                const user = interaction.options.getUser('usuario') || interaction.user;

                const stats = db.prepare(`
                    SELECT xp, level FROM usuarios WHERE user_id=?
                `).get(user.id);

                const barra = criarBarraXp(stats?.xp || 0, stats?.level || 1);

                const embed = new EmbedBuilder()
                    .setTitle(`👤 ${user.tag}`)
                    .addFields(
                        { name: "🏆 Nível", value: (stats?.level || 1).toString(), inline: true },
                        { name: "✨ XP", value: barra }
                    );

                await interaction.editReply({ embeds:[embed] });
            }

            // ===== RANKING =====
            if (commandName === 'ranking') {

                await interaction.deferReply();

                const top = db.prepare(`
                    SELECT username, xp FROM usuarios
                    ORDER BY xp DESC
                    LIMIT 10
                `).all();

                if (!top.length) {
                    return interaction.editReply("Ninguém no ranking ainda.");
                }

                const texto = top.map((u, i) =>
                    `**${i+1}.** ${u.username} — ${u.xp} XP`
                ).join("\n");

                const embed = new EmbedBuilder()
                    .setTitle("🏆 Ranking")
                    .setDescription(texto);

                await interaction.editReply({ embeds: [embed] });
            }

            // ===== RECOMENDAR JOGO =====
            if (commandName === 'recomendarjogo') {

                await interaction.deferReply();

                const nome = interaction.options.getString('titulo');
                const results = await searchGame(nome);

                if (!results.length) {
                    return interaction.editReply("❌ Nenhum jogo encontrado.");
                }

                const jogo = results[0];

                const embed = new EmbedBuilder()
                    .setTitle(`🎮 Recomendação: ${jogo.name}`)
                    .setDescription("Recomendado pela comunidade!")
                    .setThumbnail(jogo.background_image);

                await interaction.editReply({ embeds: [embed] });
            }

            // ===== RECOMENDAÇÃO INTELIGENTE =====
            if (commandName === 'recomendacaointeligente') {

                await interaction.deferReply();

                const topGame = db.prepare(`
                    SELECT game_name, server_score 
                    FROM avaliacoes_jogos
                    ORDER BY server_score DESC
                    LIMIT 1
                `).get();

                if (!topGame) {
                    return interaction.editReply("Ainda não há recomendações.");
                }

                const embed = new EmbedBuilder()
                    .setTitle("🧠 Recomendação Inteligente")
                    .setDescription(`🔥 ${topGame.game_name}\n⭐ Nota média: ${topGame.server_score.toFixed(1)}`);

                await interaction.editReply({ embeds: [embed] });
            }
        }

    } catch (err) {
        console.error(err);

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply("❌ Erro");
            } else {
                await interaction.reply({ content: "❌ Erro", ephemeral: true });
            }
        } catch {}
    }
});

client.login(config.token);