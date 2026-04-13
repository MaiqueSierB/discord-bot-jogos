import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import config from './config.js';

const commands = [

    new SlashCommandBuilder()
        .setName('jogo')
        .setDescription('Buscar jogo')
        .addStringOption(option =>
            option.setName('titulo')
                .setDescription('Nome do jogo')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('jogosavaliados')
        .setDescription('Lista de jogos avaliados'),

    new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Ver perfil'),

    new SlashCommandBuilder()
        .setName('recomendar')
        .setDescription('Recomendar jogos'),

    // 🔥 NOVO COMANDO
    new SlashCommandBuilder()
        .setName('removerjogo')
        .setDescription('Remove um jogo do banco')
        .addStringOption(option =>
            option.setName('nome')
                .setDescription('Nome do jogo')
                .setRequired(true)
        )

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands }
);

console.log("✅ Comandos atualizados");