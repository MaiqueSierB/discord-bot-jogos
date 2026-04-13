import 'dotenv/config';

// Este objeto vai conter todas as nossas variáveis de ambiente.
// Nós lemos do process.env aqui, e apenas aqui.
const config = {
    token: process.env.TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    rawgApiKey: process.env.RAWG_API_KEY
};

// Exportamos o objeto para que outros ficheiros o possam importar.
export default config;