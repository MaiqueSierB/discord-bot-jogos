import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import config from './config.js';

const commands = [

    new SlashCommandBuilder()
        .setName('jogo')
        .setDescription('Buscar jogo')
        .addStringOption(o =>
            o.setName('titulo')
             .setDescription('Nome do jogo')
             .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('jogosavaliados')
        .setDescription('Lista de jogos'),

    new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('Ranking de usuários'),

    new SlashCommandBuilder()
        .setName('recomendarjogo')
        .setDescription('Recomenda por gênero')
        .addStringOption(o =>
            o.setName('titulo')
             .setDescription('Nome do jogo')
             .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('recomendacaointeligente')
        .setDescription('Recomendação baseada nos usuários'),

    new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Perfil de jogador')
        .addUserOption(o =>
            o.setName('usuario')
             .setDescription('Outro usuário')
             .setRequired(false)
        )

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands }
    );
    console.log("✅ Comandos atualizados!");
})();