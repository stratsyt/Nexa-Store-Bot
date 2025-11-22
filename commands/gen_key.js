const { SlashCommandBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { addKey } = require('../utils/database');
function generateKeyCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'STRATS-';
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 5; j++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (i < 2) result += '-';
    }
    return result;
}
module.exports = {
    data: new SlashCommandBuilder()
        .setName('gen_key')
        .setDescription('Generate coin redemption keys')
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('Number of keys to generate')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(50))
        .addIntegerOption(option =>
            option.setName('coins')
                .setDescription('Amount of coins per key')
                .setRequired(true)
                .setMinValue(1)),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        const quantity = interaction.options.getInteger('quantity');
        const coins = interaction.options.getInteger('coins');
        await interaction.deferReply({ ephemeral: true });
        try {
            const keys = [];
            for (let i = 0; i < quantity; i++) {
                const keyCode = generateKeyCode();
                await addKey(keyCode, coins);
                keys.push(keyCode);
            }
            const keyList = keys.join('\n');
            const message = `Generated ${quantity} keys with ${coins} coins each:\n\`\`\`\n${keyList}\n\`\`\``;
            if (message.length > 2000) {
                const chunks = [];
                let currentChunk = `Generated ${quantity} keys with ${coins} coins each:\n\`\`\`\n`;
                for (const key of keys) {
                    if ((currentChunk + key + '\n```').length > 2000) {
                        currentChunk += '```';
                        chunks.push(currentChunk);
                        currentChunk = '```\n';
                    }
                    currentChunk += key + '\n';
                }
                currentChunk += '```';
                chunks.push(currentChunk);
                await interaction.editReply(chunks[0]);
                for (let i = 1; i < chunks.length; i++) {
                    await interaction.followUp({ content: chunks[i], ephemeral: true });
                }
            } else {
                await interaction.editReply(message);
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('Failed to generate keys!');
        }
    },
};