import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import config from './config.js';

const commands = [
    new SlashCommandBuilder()
        .setName('jogo')
        .setDescription('Procurar um jogo para avaliar')
        .addStringOption(o =>
            o.setName('titulo')
             .setDescription('Nome do jogo')
             .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('jogosavaliados')
        .setDescription('Lista todos os jogos que o servidor já avaliou'),

    new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('Ver o ranking de XP dos jogadores'),

    new SlashCommandBuilder()
        .setName('removerjogo')
        .setDescription('Remove um jogo da biblioteca (Admin)')
        .addStringOption(o =>
            o.setName('titulo')
             .setDescription('Nome exato do jogo que deseja remover')
             .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('recomendacaointeligente')
        .setDescription('Sugere um jogo que você ainda não jogou'),

    new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Ver o seu nível e progresso de XP')
        .addUserOption(o =>
            o.setName('usuario')
             .setDescription('Ver o perfil de outro membro')
             .setRequired(false)
        )

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log("⏳ Atualizando comandos globais...");
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands }
        );
        console.log("✅ Comandos atualizados com sucesso!");
    } catch (error) {
        console.error("❌ Erro ao atualizar comandos:", error);
    }
})();