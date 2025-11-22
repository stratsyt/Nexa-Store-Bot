const config = require('../config.json');
function hasAdminRole(member) {
    return member.roles.cache.has(config.adminRole);
}
function requireAdmin(interaction) {
    if (!hasAdminRole(interaction.member)) {
        return false;
    }
    return true;
}
async function checkAdmin(interaction) {
    if (!requireAdmin(interaction)) {
        await interaction.reply({ content: 'You need the admin role to use this command!', ephemeral: true });
        return false;
    }
    return true;
}
module.exports = {
    hasAdminRole,
    requireAdmin,
    checkAdmin
};