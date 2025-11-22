const { SlashCommandBuilder, EmbedBuilder, InteractionResponseFlags } = require('discord.js');
const { checkAdmin } = require('../utils/auth');
const { getAllUsers } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
const config = require('../config.json');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('sync_customers')
        .setDescription('Give customer role to all users in the database'),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        await interaction.deferReply({ ephemeral: true });
        try {
            const users = await getAllUsers();
            if (users.length === 0) {
                await interaction.editReply('No users found in the database!');
                return;
            }
            const customerRole = interaction.guild.roles.cache.get(config.customerRole);
            if (!customerRole) {
                await interaction.editReply('Customer role not found! Please check the customerRole ID in config.json');
                return;
            }
            let successCount = 0;
            let errorCount = 0;
            let alreadyHadRole = 0;
            const errors = [];
            for (const user of users) {
                try {
                    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
                    if (!member) {
                        errorCount++;
                        errors.push(`User ${user.id} not found in server`);
                        continue;
                    }
                    if (member.roles.cache.has(config.customerRole)) {
                        alreadyHadRole++;
                        continue;
                    }
                    await member.roles.add(customerRole);
                    successCount++;
                } catch (error) {
                    errorCount++;
                    errors.push(`${user.id}: ${error.message}`);
                }
            }
            const embed = new EmbedBuilder()
                .setTitle('🔄 Customer Role Sync Complete')
                .setDescription(`Synced customer roles for users in the database`)
                .addFields(
                    { name: '✅ Roles Added', value: successCount.toString(), inline: true },
                    { name: '👥 Already Had Role', value: alreadyHadRole.toString(), inline: true },
                    { name: '❌ Errors', value: errorCount.toString(), inline: true },
                    { name: '📊 Total Users', value: users.length.toString(), inline: true },
                    { name: '🎭 Role', value: customerRole.name, inline: true },
                    { name: '📈 Success Rate', value: `${Math.round((successCount / users.length) * 100)}%`, inline: true }
                )
                .setColor(getRandomColor())
                .setFooter({ text: `Customer Role ID: ${config.customerRole}` });
            if (errors.length > 0 && errors.length <= 10) {
                embed.addFields({ 
                    name: '⚠️ Errors', 
                    value: errors.slice(0, 10).join('\n').substring(0, 1024), 
                    inline: false 
                });
            }
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Sync customers error:', error);
            await interaction.editReply('Failed to sync customer roles!');
        }
    },
};