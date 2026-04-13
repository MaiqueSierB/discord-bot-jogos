import axios from 'axios';
import config from './config.js';

const BASE = 'https://api.rawg.io/api';

export async function searchGame(name) {
    const res = await axios.get(`${BASE}/games`, {
        params: { key: config.rawgApiKey, search: name }
    });
    return res.data.results;
}

export async function getGameDetails(id) {
    const res = await axios.get(`${BASE}/games/${id}`, {
        params: { key: config.rawgApiKey }
    });
    return res.data;
}