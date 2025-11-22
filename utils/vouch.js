const { EmbedBuilder } = require('discord.js');
const { addCoins } = require('./database');
const { logTransaction, logBalanceChange } = require('./logging');
const { getRandomColor } = require('./randomcolor');
const fs = require('fs');
const path = require('path');
const VOUCH_DATA_FILE = path.join(__dirname, '..', 'databases', 'vouch_data.json');
function loadVouchData() {
    try {
        if (fs.existsSync(VOUCH_DATA_FILE)) {
            const data = fs.readFileSync(VOUCH_DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading vouch data:', error);
    }
    return {
        stickyMessageId: null,
        cooldowns: {} 
    };
}
function saveVouchData(data) {
    try {
        fs.writeFileSync(VOUCH_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving vouch data:', error);
    }
}
function createVouchEmbed() {
    return new EmbedBuilder()
        .setTitle('💬 Vouch & Earn 10 Coins!')
        .setDescription(
            '**Start your message with `+rep` or `+vouch` to earn coins!**\n\n' +
            '**Example:**\n' +
            '```+rep Fast delivery and great accounts!```\n\n' +
            '**Reward:** 10 coins • **Cooldown:** 24 hours'
        )
        .setColor(getRandomColor())
        .setFooter({ text: 'Thank you for your support! 💙' })
        .setTimestamp();
}
async function updateStickyMessage(channel) {
    const vouchData = loadVouchData();
    try {
        if (vouchData.stickyMessageId) {
            try {
                const oldMessage = await channel.messages.fetch(vouchData.stickyMessageId);
                await oldMessage.delete();
            } catch (error) {
            }
        }
        const embed = createVouchEmbed();
        const newMessage = await channel.send({ embeds: [embed] });
        vouchData.stickyMessageId = newMessage.id;
        saveVouchData(vouchData);
        return newMessage;
    } catch (error) {
        console.error('Error updating sticky message:', error);
        return null;
    }
}
function isOnCooldown(userId) {
    const vouchData = loadVouchData();
    const lastVouch = vouchData.cooldowns[userId];
    if (!lastVouch) return false;
    const now = Date.now();
    const cooldownEnd = lastVouch + (24 * 60 * 60 * 1000); 
    return now < cooldownEnd;
}
function getRemainingCooldown(userId) {
    const vouchData = loadVouchData();
    const lastVouch = vouchData.cooldowns[userId];
    if (!lastVouch) return 0;
    const now = Date.now();
    const cooldownEnd = lastVouch + (24 * 60 * 60 * 1000);
    const remaining = cooldownEnd - now;
    return remaining > 0 ? remaining : 0;
}
function setCooldown(userId) {
    const vouchData = loadVouchData();
    vouchData.cooldowns[userId] = Date.now();
    saveVouchData(vouchData);
}
async function processVouch(message) {
    const userId = message.author.id;
    const content = message.content.toLowerCase();
    if (!content.startsWith('+rep') && !content.startsWith('+vouch')) {
        return false;
    }
    if (isOnCooldown(userId)) {
        const remaining = getRemainingCooldown(userId);
        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        const cooldownEmbed = new EmbedBuilder()
            .setTitle('⏰ Cooldown Active')
            .setDescription(
                `You can vouch again in **${hours}h ${minutes}m**\n\n` +
                'You can only earn vouch rewards once every 24 hours.'
            )
            .setColor(0xFFA500)
            .setFooter({ text: 'Thank you for your patience!' });
        try {
            await message.author.send({ embeds: [cooldownEmbed] });
        } catch (dmError) {
            console.log(`[VOUCH] Could not send DM to user ${userId}: ${dmError.message}`);
            const reply = await message.reply({ embeds: [cooldownEmbed] });
            setTimeout(() => {
                reply.delete().catch(() => {});
            }, 10000);
        }
        return false;
    }
    const VOUCH_REWARD = 10;
    try {
        await addCoins(userId, VOUCH_REWARD);
        await logTransaction('vouch_reward', userId, VOUCH_REWARD, { 
            message: message.content.substring(0, 100) 
        });
        await logBalanceChange(userId, VOUCH_REWARD, 'Vouch Reward', 'Left a vouch in vouch channel');
        setCooldown(userId);
        const rewardEmbed = new EmbedBuilder()
            .setTitle('✅ Thank You for Your Vouch!')
            .setDescription(
                `You've been rewarded **${VOUCH_REWARD} coins** for leaving a vouch!\n\n` +
                '**Your feedback helps us improve!**\n' +
                'You can vouch again in 24 hours for another reward.'
            )
            .setColor(0x00FF00)
            .setFooter({ text: 'We appreciate your support! 💙' });
        try {
            await message.author.send({ embeds: [rewardEmbed] });
        } catch (dmError) {
            console.log(`[VOUCH] Could not send DM to user ${userId}: ${dmError.message}`);
            const reply = await message.reply({ embeds: [rewardEmbed] });
            setTimeout(() => {
                reply.delete().catch(() => {});
            }, 10000);
        }
        console.log(`[VOUCH] User ${userId} received ${VOUCH_REWARD} coins for vouching`);
        return true;
    } catch (error) {
        console.error('Error processing vouch reward:', error);
        return false;
    }
}
module.exports = {
    updateStickyMessage,
    processVouch,
    isOnCooldown,
    getRemainingCooldown,
    createVouchEmbed
};