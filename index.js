import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

// ======================
// DEBUG
// ======================
console.log("🚀 BOT INICIANDO...");
console.log("TOKEN:", process.env.TOKEN ? "OK" : "UNDEFINED");

// ======================
// BANCO
// ======================
const db = new Database('./database.sqlite');

db.prepare(`
CREATE TABLE IF NOT EXISTS avaliacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  nome TEXT,
  nota INTEGER
)
`).run();

// ======================
// CLIENTE
// ======================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ======================
// READY
// ======================
client.once('ready', () => {
  console.log(`✅ Logado como ${client.user.tag}`);
});

// ======================
// INTERAÇÕES
// ======================
client.on('interactionCreate', async interaction => {

  // ======================
  // COMANDOS
  // ======================
  if (interaction.isChatInputCommand()) {

    try {

      if (interaction.commandName === 'jogo') {

        const nome = interaction.options.getString('titulo');

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`avaliar_${nome}`)
            .setLabel('Dar nota')
            .setStyle(ButtonStyle.Success)
        );

        await interaction.reply({
          content: `🎮 **${nome}**\nClique para avaliar`,
          components: [row]
        });
      }

      if (interaction.commandName === 'jogosavaliados') {

        const jogos = db.prepare("SELECT * FROM avaliacoes").all();

        if (jogos.length === 0) {
          return interaction.reply("Nenhum jogo avaliado ainda.");
        }

        let texto = jogos.map(j => `🎮 ${j.nome} - ⭐ ${j.nota}`).join('\n');

        await interaction.reply(texto);
      }

      if (interaction.commandName === 'removerjogo') {

        const nome = interaction.options.getString('nome');

        db.prepare("DELETE FROM avaliacoes WHERE nome = ?").run(nome);

        await interaction.reply(`🗑️ ${nome} removido.`);
      }

    } catch (err) {
      console.error("❌ ERRO:", err);
      await interaction.reply({ content: 'Erro no comando', ephemeral: true });
    }
  }

  // ======================
  // BOTÃO
  // ======================
  if (interaction.isButton()) {

    if (interaction.customId.startsWith('avaliar_')) {

      const nome = interaction.customId.replace('avaliar_', '');

      // nota fixa (pode melhorar depois)
      const nota = 10;

      db.prepare(`
        INSERT INTO avaliacoes (user_id, nome, nota)
        VALUES (?, ?, ?)
      `).run(interaction.user.id, nome, nota);

      await interaction.reply({
        content: `✅ Nota registrada: ${nota}`,
        ephemeral: true
      });
    }
  }

});

// ======================
// LOGIN
// ======================
client.login(process.env.TOKEN)
  .then(() => console.log("🔥 BOT LOGADO"))
  .catch(err => console.error("💀 ERRO TOKEN:", err));