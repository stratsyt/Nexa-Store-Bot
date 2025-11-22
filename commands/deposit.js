const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkBlacklist } = require('../utils/blacklist');
const { addDeposit, updateDepositStatus, addCoins, getUserCoins } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
const { logTransaction, logBalanceChange } = require('../utils/logging');
const NOWPaymentsClient = require('../utils/nowpayments');
function getStatusDisplay(paymentStatus) {
    const statusEmoji = {
        'waiting': '⏳',
        'confirming': '🔄',
        'sending': '📤',
        'finished': '✅',
        'confirmed': '✅',
        'failed': '❌',
        'expired': '⏰'
    };
    const statusText = {
        'waiting': 'Waiting for Payment',
        'confirming': 'Confirming Payment',
        'sending': 'Processing Payment',
        'finished': 'Payment Complete',
        'confirmed': 'Payment Confirmed',
        'failed': 'Payment Failed',
        'expired': 'Payment Expired'
    };
    const currentStatus = paymentStatus || 'waiting';
    return `${statusEmoji[currentStatus] || '⏳'} ${statusText[currentStatus] || 'Awaiting Payment'}`;
}
async function checkPaymentStatus(paymentId, userId, coins, client) {
    try {
        const nowpayments = new NOWPaymentsClient();
        const status = await nowpayments.getPaymentStatus(paymentId);
        console.log(`Checking payment ${paymentId}: ${status.payment_status}`);
        if (status.payment_status === 'sending' || status.payment_status === 'finished' || status.payment_status === 'confirmed') {
            await updateDepositStatus(paymentId, 'completed');
            await addCoins(userId, coins);
            await logTransaction('crypto_deposit', userId, coins, { 
                currency: status.pay_currency || 'Unknown',
                usdAmount: status.price_amount || 0,
                paymentId: paymentId,
                status: 'Completed'
            });
            await logBalanceChange(userId, coins, 'Crypto Deposit', `${status.pay_currency || 'Crypto'} deposit confirmed`, paymentId);
            try {
                const config = require('../config.json');
                if (config.customerRole && config.customerRole !== 'your_customer_role_id_here') {
                    const guild = client.guilds.cache.first();
                    if (guild) {
                        const member = await guild.members.fetch(userId).catch(() => null);
                        if (member && !member.roles.cache.has(config.customerRole)) {
                            await member.roles.add(config.customerRole);
                            console.log(`✅ Added customer role to user ${userId} after crypto deposit`);
                        }
                    }
                }
            } catch (roleError) {
                console.log(`⚠️ Could not add customer role to user ${userId}: ${roleError.message}`);
            }
            try {
                const user = await client.users.fetch(userId);
                const userCoins = await getUserCoins(userId);
                const totalCoins = userCoins ? userCoins.coins : coins;
                await user.send({
                    embeds: [{
                        title: 'Deposit Paid!',
                        description: `Your crypto payment has been confirmed!\n\n**Coins Added:** ${coins}\n**New Balance:** ${totalCoins} coins`,
                        color: getRandomColor(),
                        footer: { text: `Payment ID: ${paymentId}` }
                    }]
                });
            } catch (dmError) {
                console.error('Failed to send DM:', dmError);
            }
            console.log(`Payment ${paymentId} completed - ${coins} coins added to user ${userId}`);
            return; 
        } else if (status.payment_status === 'expired' || status.payment_status === 'failed') {
            await updateDepositStatus(paymentId, 'failed');
            console.log(`Payment ${paymentId} failed/expired - stopped checking`);
            return; 
        } else {
            console.log(`Payment ${paymentId} still ${status.payment_status} - checking again in 1 minute`);
            setTimeout(() => checkPaymentStatus(paymentId, userId, coins, client), 60000);
        }
    } catch (error) {
        console.error(`Error checking payment ${paymentId}:`, error);
        setTimeout(() => checkPaymentStatus(paymentId, userId, coins, client), 60000);
    }
}
module.exports = {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Deposit cryptocurrency to add coins to your balance')
        .addStringOption(option =>
            option.setName('crypto')
                .setDescription('Choose cryptocurrency')
                .setRequired(true)
                .addChoices(
                    { name: 'Bitcoin (BTC)', value: 'BTC' },
                    { name: 'Ethereum (ETH)', value: 'ETH' },
                    { name: 'Litecoin (LTC)', value: 'LTC' },
                    { name: 'Solana (SOL)', value: 'SOL' },
                    { name: 'Dogecoin (DOGE)', value: 'DOGE' },
                    { name: 'Bitcoin Cash (BCH)', value: 'BCH' },
                    { name: 'Monero (XMR)', value: 'XMR' },
                    { name: 'Tether (USDT)', value: 'USDT' },
                    { name: 'USD Coin (USDC)', value: 'USDC' },
                    { name: 'Binance Coin (BNB)', value: 'BNB' }
                ))
        .addIntegerOption(option =>
            option.setName('coins')
                .setDescription('Amount of coins to purchase (1 coin = $0.01)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10000)),
    async execute(interaction) {
        if (!(await checkBlacklist(interaction))) return;
        await interaction.deferReply({ ephemeral: true });
        const crypto = interaction.options.getString('crypto');
        const coins = interaction.options.getInteger('coins');
        const userId = interaction.user.id;
        const amountUsd = coins * 0.01;
        try {
            const nowpayments = new NOWPaymentsClient();
            const orderId = `deposit_${userId}_${Date.now()}`;
            console.log('Creating NOWPayments payment:', { amountUsd, crypto, orderId });
            const payment = await nowpayments.createPayment(
                amountUsd,
                crypto,
                orderId,
                {
                    userId: userId,
                    coins: coins,
                    discordUser: interaction.user.username
                }
            );
            console.log('NOWPayments response:', payment);
            await addDeposit(payment.payment_id, userId, coins, crypto, amountUsd);
            setTimeout(() => checkPaymentStatus(payment.payment_id, userId, coins, interaction.client), 60000);
            const embed = new EmbedBuilder()
                .setTitle(`💰 ${crypto} Deposit`)
                .setDescription(`**Amount:** ${coins} coins ($${amountUsd.toFixed(2)})\n**Currency:** ${crypto}\n**Status:** ${getStatusDisplay(payment.payment_status)}`)
                .addFields(
                    { name: 'Payment Address', value: `\`${payment.pay_address}\``, inline: false },
                    { name: 'Amount to Send', value: `${payment.pay_amount} ${crypto}`, inline: true },
                    { name: 'Payment ID', value: payment.payment_id, inline: true }
                )
                .setColor(getRandomColor())
                .setFooter({ text: 'Send the exact amount to the address above' });
            await interaction.editReply({
                embeds: [embed]
            });
        } catch (error) {
            console.error('Deposit error:', error);
            await interaction.editReply({
                content: 'Failed to create payment. Please try again later or contact support.'
            });
        }
    },
};