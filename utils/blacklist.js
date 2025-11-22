const { isBlacklisted } = require('./database');
async function checkBlacklist(interaction) {
    try {
        const blacklisted = await isBlacklisted(interaction.user.id);
        if (blacklisted) {
            await interaction.reply({ content: 'You are blacklisted from using this bot!', ephemeral: true });
            return false;
        }
        return true;
    } catch (error) {
        console.error('Blacklist check error:', error);
        return true;
    }
}
module.exports = {
    checkBlacklist
};