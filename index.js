import {
    Client,
    Events,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';

import db from "./db.js";
import config from './config.js';
import {
    searchMovie,
    getMovieDetails,
    getMoviesByGenre
} from './tmdb.js';

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, c => {
    console.log(`🎬 RMDB online como ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
    try {

        // ================= BOTÕES =================
        if (interaction.isButton()) {

            if (interaction.customId.startsWith('filme_escolha_')) {

                const [, , id, tipo] = interaction.customId.split('_');

                const movie = await getMovieDetails(id, tipo);

                const titulo = movie.title || movie.name;
                const data = movie.release_date || movie.first_air_date;

                const posterUrl = movie.poster_path
                    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
                    : null;

                const embed = new EmbedBuilder()
                    .setTitle(`${titulo} (${data ? new Date(data).getFullYear() : 's/ano'})`)
                    .setDescription(movie.overview || "Sem descrição.")
                    .addFields({
                        name: "Nota TMDB",
                        value: movie.vote_average?.toFixed(1) || "0",
                        inline: true
                    });

                if (posterUrl) embed.setThumbnail(posterUrl);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`avaliar_filme_${id}_${tipo}`)
                        .setLabel('Dar nota')
                        .setStyle(ButtonStyle.Success)
                );

                await interaction.update({
                    embeds: [embed],
                    components: [row]
                });
            }

            if (interaction.customId.startsWith('avaliar_filme_')) {

                const [, , id, tipo] = interaction.customId.split('_');

                const modal = new ModalBuilder()
                    .setCustomId(`modal_${id}_${tipo}`)
                    .setTitle('Avaliar');

                const input = new TextInputBuilder()
                    .setCustomId('nota')
                    .setLabel('Nota (0-10)')
                    .setStyle(TextInputStyle.Short);

                modal.addComponents(new ActionRowBuilder().addComponents(input));

                await interaction.showModal(modal);
            }

            return;
        }

        // ================= MODAL =================
        if (interaction.isModalSubmit()) {

            const [, id] = interaction.customId.split('_');
            const nota = parseFloat(interaction.fields.getTextInputValue('nota'));

            if (isNaN(nota) || nota < 0 || nota > 10) {
                return interaction.reply({ content: "Nota inválida", ephemeral: true });
            }

            const userId = interaction.user.id;
            const username = interaction.user.tag;

            db.prepare(`
                INSERT INTO votos_filmes (movie_id, user_id, username, score)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(movie_id, user_id) DO UPDATE SET score = excluded.score
            `).run(id, userId, username, nota);

            const stats = db.prepare(`
                SELECT AVG(score) as avg, COUNT(*) as total
                FROM votos_filmes
                WHERE movie_id = ?
            `).get(id);

            const movie = await getMovieDetails(id);

            db.prepare(`
                INSERT INTO avaliacoes_filmes (movie_id, title, server_score, vote_count)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(movie_id) DO UPDATE SET
                    server_score = excluded.server_score,
                    vote_count = excluded.vote_count
            `).run(id, movie.title || movie.name, stats.avg, stats.total);

            await interaction.reply({
                content: `⭐ Nota registrada: ${nota} | Média: ${stats.avg.toFixed(1)}`,
                ephemeral: true
            });

            return;
        }

        // ================= COMANDOS =================
        if (interaction.isChatInputCommand()) {

            const { commandName } = interaction;

            // 🎬 BUSCAR
            if (commandName === 'filme') {

                await interaction.deferReply();

                const titulo = interaction.options.getString('titulo');
                const results = await searchMovie(titulo);

                if (!results.length) {
                    return interaction.editReply("Nada encontrado.");
                }

                const embed = new EmbedBuilder()
                    .setTitle(`Resultados para "${titulo}"`)
                    .setDescription(
                        results.map((m, i) =>
                            `${i + 1}. ${m.title} ${m.media_type === "tv" ? "📺" : "🎬"}`
                        ).join('\n')
                    );

                const row = new ActionRowBuilder().addComponents(
                    results.map((m, i) =>
                        new ButtonBuilder()
                            .setCustomId(`filme_escolha_${m.id}_${m.media_type}`)
                            .setLabel(`${i + 1}`)
                            .setStyle(ButtonStyle.Primary)
                    )
                );

                await interaction.editReply({
                    embeds: [embed],
                    components: [row]
                });
            }

            // 🎬 LISTA
            if (commandName === 'filmesavaliados') {

                await interaction.deferReply();

                const filmes = db.prepare(`
                    SELECT title, server_score, vote_count
                    FROM avaliacoes_filmes
                    ORDER BY server_score DESC
                `).all();

                if (!filmes.length) {
                    return interaction.editReply("Nenhum filme avaliado.");
                }

                const embed = new EmbedBuilder()
                    .setTitle("🎬 Filmes avaliados")
                    .setDescription(
                        filmes.map((f, i) =>
                            `${i + 1}. ${f.title} ⭐ ${f.server_score?.toFixed(1) || 0} (${f.vote_count})`
                        ).join('\n')
                    );

                await interaction.editReply({ embeds: [embed] });
            }

            // 📊 STATS
            if (commandName === 'stats') {

                await interaction.deferReply();

                const total = db.prepare(`
                    SELECT COUNT(*) as total FROM votos_filmes
                `).get();

                const usuarios = db.prepare(`
                    SELECT COUNT(DISTINCT user_id) as total FROM votos_filmes
                `).get();

                const embed = new EmbedBuilder()
                    .setTitle("📊 Estatísticas")
                    .addFields(
                        { name: "Total de avaliações", value: `${total.total}`, inline: true },
                        { name: "Usuários ativos", value: `${usuarios.total}`, inline: true }
                    );

                await interaction.editReply({ embeds: [embed] });
            }

            // 🎯 RECOMENDAR
            if (commandName === 'recomendar') {

                await interaction.deferReply();

                const genero = interaction.options.getString('genero');
                const filmes = await getMoviesByGenre(genero);

                const embed = new EmbedBuilder()
                    .setTitle("🎯 Recomendações")
                    .setDescription(
                        filmes.slice(0, 10).map(f => `• ${f.title}`).join('\n')
                    );

                await interaction.editReply({ embeds: [embed] });
            }
        }

    } catch (err) {
        console.error("ERRO:", err);

        if (interaction.deferred) {
            await interaction.editReply("❌ Erro.");
        } else {
            await interaction.reply({ content: "❌ Erro.", ephemeral: true });
        }
    }
});

client.login(config.token);