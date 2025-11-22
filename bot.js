const { Client, GatewayIntentBits, Collection, REST, Routes, InteractionResponseFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { setDiscordClient, logTransaction, logBalanceChange } = require('./utils/logging');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}
client.once('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    setDiscordClient(client);
    try {
        console.log('🔄 Initializing antipublic database...');
        const { testConnection } = require('./utils/antipublic');
        await testConnection();
        console.log('✅ Antipublic database initialized and tested');
    } catch (error) {
        console.error('❌ Error initializing antipublic database:', error);
    }
    try {
        console.log('🔄 Syncing stock counts on startup...');
        const { syncAllProductStock } = require('./utils/database');
        const syncResults = await syncAllProductStock();
        if (syncResults.length > 0) {
            console.log(`📊 Startup stock sync: ${syncResults.length} products updated`);
            for (const result of syncResults) {
                console.log(`  - ${result.name}: ${result.oldStock} → ${result.newStock} (${result.difference > 0 ? '+' : ''}${result.difference})`);
            }
        } else {
            console.log('✅ All stock counts already in sync');
        }
    } catch (error) {
        console.error('❌ Error syncing stock on startup:', error);
    }
    try {
        if (config.vouchChannel && config.vouchChannel !== 'your_vouch_channel_id_here') {
            console.log('🔄 Setting up vouch sticky message...');
            const { updateStickyMessage } = require('./utils/vouch');
            const vouchChannel = await client.channels.fetch(config.vouchChannel);
            if (vouchChannel) {
                await updateStickyMessage(vouchChannel);
                console.log('✅ Vouch sticky message setup complete');
            } else {
                console.log('⚠️ Vouch channel not found - check config.json');
            }
        }
    } catch (error) {
        console.error('❌ Error setting up vouch sticky message:', error);
    }
    const commands = [];
    for (const command of client.commands.values()) {
        commands.push(command.data.toJSON());
    }
    const rest = new REST().setToken(config.token);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error(error);
    }
});
client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command || !command.autocomplete) return;
        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(error);
        }
        return;
    }
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('refund_proof_')) {
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const { addRefund } = require('./utils/database');
            const { getRandomColor } = require('./utils/randomcolor');
            const config = require('./config.json');
            const [, , orderId, requestedAmount] = interaction.customId.split('_');
            const proofLinks = interaction.fields.getTextInputValue('proof_links');
            const refundData = client.refundData?.[`${orderId}_${requestedAmount}`];
            if (!refundData) {
                await interaction.reply({ content: 'Refund data not found!', flags: InteractionResponseFlags.Ephemeral });
                return;
            }
            try {
                const refundId = generateRefundId();
                await addRefund(refundId, orderId, refundData.userId, refundData.requestedAmount, refundData.reason, proofLinks);
                const refundChannel = interaction.guild.channels.cache.get(config.refundChannel);
                if (refundChannel) {
                    const refundEmbed = new EmbedBuilder()
                        .setTitle(`🔄 Refund Request #${refundId}`)
                        .setDescription(`**Order:** #${orderId}\n**Customer:** <@${refundData.userId}>\n**Product:** ${refundData.order.product_name}\n**Quantity:** ${refundData.order.quantity}\n**Order Total:** ${refundData.order.total_cost} coins`)
                        .addFields(
                            { name: '💰 Requested Amount', value: `${refundData.requestedAmount} coins`, inline: true },
                            { name: '📅 Order Date', value: `<t:${Math.floor(new Date(refundData.order.completed_at).getTime() / 1000)}:F>`, inline: true },
                            { name: '❓ Reason', value: refundData.reason, inline: false },
                            { name: '🔗 Proof Links', value: proofLinks, inline: false }
                        )
                        .setColor(getRandomColor())
                        .setFooter({ text: `Refund ID: ${refundId}` });
                    const buttons = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`approve_refund_${refundId}`)
                                .setLabel('Approve')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('✅'),
                            new ButtonBuilder()
                                .setCustomId(`decline_refund_${refundId}`)
                                .setLabel('Decline')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('❌')
                        );
                    await refundChannel.send({ embeds: [refundEmbed], components: [buttons] });
                }
                await interaction.reply({ content: `Refund request submitted! Request ID: ${refundId}\nAdmins will review your request shortly.`, flags: InteractionResponseFlags.Ephemeral });
                delete client.refundData[`${orderId}_${requestedAmount}`];
            } catch (error) {
                console.error('Refund submission error:', error);
                await interaction.reply({ content: 'Failed to submit refund request!', flags: InteractionResponseFlags.Ephemeral });
            }
        }
        return;
    }
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('metrics_')) {
            const metricsCommand = client.commands.get('metrics');
            if (metricsCommand && metricsCommand.handleButton) {
                try {
                    await metricsCommand.handleButton(interaction);
                } catch (error) {
                    console.error('Metrics button error:', error);
                }
            }
            return;
        }
        if (interaction.customId.startsWith('approve_refund_') || interaction.customId.startsWith('decline_refund_')) {
            const { checkAdmin } = require('./utils/auth');
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
            if (!(await checkAdmin(interaction))) return;
            const refundId = interaction.customId.split('_')[2];
            const action = interaction.customId.startsWith('approve_refund_') ? 'approve' : 'decline';
            const modal = new ModalBuilder()
                .setCustomId(`${action}_refund_modal_${refundId}`)
                .setTitle(`${action.charAt(0).toUpperCase() + action.slice(1)} Refund Request`);
            if (action === 'approve') {
                const amountInput = new TextInputBuilder()
                    .setCustomId('approved_amount')
                    .setLabel('Amount to Refund (coins)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                const reasonInput = new TextInputBuilder()
                    .setCustomId('admin_reason')
                    .setLabel('Admin Notes (optional)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false);
                modal.addComponents(
                    new ActionRowBuilder().addComponents(amountInput),
                    new ActionRowBuilder().addComponents(reasonInput)
                );
            } else {
                const reasonInput = new TextInputBuilder()
                    .setCustomId('decline_reason')
                    .setLabel('Reason for Decline')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            }
            await interaction.showModal(modal);
        }
        return;
    }
    if (interaction.isModalSubmit() && (interaction.customId.startsWith('approve_refund_modal_') || interaction.customId.startsWith('decline_refund_modal_'))) {
        const { getRefund, updateRefundStatus, addCoins } = require('./utils/database');
        const { EmbedBuilder } = require('discord.js');
        const { getRandomColor } = require('./utils/randomcolor');
        const refundId = interaction.customId.split('_')[3];
        const action = interaction.customId.startsWith('approve_refund_modal_') ? 'approve' : 'decline';
        try {
            const refund = await getRefund(refundId);
            if (!refund) {
                await interaction.reply({ content: 'Refund not found!', flags: InteractionResponseFlags.Ephemeral });
                return;
            }
            if (refund.status !== 'pending') {
                await interaction.reply({ content: 'This refund has already been processed!', flags: InteractionResponseFlags.Ephemeral });
                return;
            }
            if (action === 'approve') {
                const approvedAmount = parseInt(interaction.fields.getTextInputValue('approved_amount'));
                const adminReason = interaction.fields.getTextInputValue('admin_reason') || 'Refund approved';
                if (isNaN(approvedAmount) || approvedAmount <= 0) {
                    await interaction.reply({ content: 'Invalid refund amount!', flags: InteractionResponseFlags.Ephemeral });
                    return;
                }
                await updateRefundStatus(refundId, 'approved', adminReason, approvedAmount, interaction.user.id);
                await addCoins(refund.user_id, approvedAmount);
                await logTransaction('refund', refund.user_id, approvedAmount, {
                    orderId: refund.order_id,
                    refundId: refundId,
                    processedBy: interaction.user.id,
                    reason: adminReason || 'No reason provided'
                });
                await logBalanceChange(refund.user_id, approvedAmount, 'Refund', `Refund approved for order ${refund.order_id}`, refund.order_id);
                try {
                    const user = await interaction.client.users.fetch(refund.user_id);
                    const approvalEmbed = new EmbedBuilder()
                        .setTitle('✅ Refund Approved')
                        .setDescription(`Your refund request has been approved!\n\n**Refund ID:** ${refundId}\n**Order:** #${refund.order_id}\n**Amount Refunded:** ${approvedAmount} coins\n**Admin Notes:** ${adminReason}`)
                        .setColor(0x00ff00)
                        .setFooter({ text: `Processed by ${interaction.user.username}` });
                    await user.send({ embeds: [approvalEmbed] });
                } catch (dmError) {
                    console.error('Failed to send approval DM:', dmError);
                }
                await interaction.reply({ content: `Refund approved! ${approvedAmount} coins have been added to the user's balance.`, flags: InteractionResponseFlags.Ephemeral });
            } else {
                const declineReason = interaction.fields.getTextInputValue('decline_reason');
                await updateRefundStatus(refundId, 'declined', declineReason, 0, interaction.user.id);
                try {
                    const user = await interaction.client.users.fetch(refund.user_id);
                    const declineEmbed = new EmbedBuilder()
                        .setTitle('❌ Refund Declined')
                        .setDescription(`Your refund request has been declined.\n\n**Refund ID:** ${refundId}\n**Order:** #${refund.order_id}\n**Reason:** ${declineReason}`)
                        .setColor(0xff0000)
                        .setFooter({ text: `Processed by ${interaction.user.username}` });
                    await user.send({ embeds: [declineEmbed] });
                } catch (dmError) {
                    console.error('Failed to send decline DM:', dmError);
                }
                await interaction.reply({ content: 'Refund declined. User has been notified.', flags: InteractionResponseFlags.Ephemeral });
            }
            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = new EmbedBuilder(originalEmbed.data)
                .setTitle(`${action === 'approve' ? '✅' : '❌'} ${originalEmbed.data.title} - ${action.charAt(0).toUpperCase() + action.slice(1)}d`)
                .setColor(action === 'approve' ? 0x00ff00 : 0xff0000);
            await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
        } catch (error) {
            console.error('Refund processing error:', error);
            await interaction.reply({ content: 'Failed to process refund!', flags: InteractionResponseFlags.Ephemeral });
        }
        return;
    }
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'There was an error while executing this command!', flags: InteractionResponseFlags.Ephemeral });
        } else {
            await interaction.reply({ content: 'There was an error while executing this command!', flags: InteractionResponseFlags.Ephemeral });
        }
    }
});
function generateRefundId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'REF-';
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 5; j++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (i < 1) result += '-';
    }
    return result;
}
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (config.vouchChannel && config.vouchChannel !== 'your_vouch_channel_id_here' && message.channel.id === config.vouchChannel) {
        const { processVouch, updateStickyMessage } = require('./utils/vouch');
        await processVouch(message);
        await updateStickyMessage(message.channel);
    }
});
client.login(config.token);