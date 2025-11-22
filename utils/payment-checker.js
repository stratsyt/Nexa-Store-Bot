const { getDeposit, updateDepositStatus, addCoins, getUserCoins } = require('./database');
const NOWPaymentsClient = require('./nowpayments');
class PaymentChecker {
    constructor(discordClient) {
        this.client = discordClient;
        this.nowpayments = new NOWPaymentsClient();
        this.checkInterval = 60000; 
    }
    start() {
        setInterval(() => {
            this.checkPendingPayments();
        }, this.checkInterval);
        console.log('Payment checker started - checking every minute');
    }
    async checkPendingPayments() {
        try {
            console.log('Checking pending payments...');
        } catch (error) {
            console.error('Error checking payments:', error);
        }
    }
    async processPayment(deposit, paymentStatus) {
        await updateDepositStatus(deposit.invoice_id, 'completed');
        await addCoins(deposit.user_id, deposit.coin_amount);
        try {
            const user = await this.client.users.fetch(deposit.user_id);
            const userCoins = await getUserCoins(deposit.user_id);
            const totalCoins = userCoins ? userCoins.coins : deposit.coin_amount;
            await user.send({
                embeds: [{
                    title: '✅ Payment Confirmed!',
                    description: `Your ${deposit.crypto_currency} payment has been confirmed!\n\n**Coins Added:** ${deposit.coin_amount}\n**New Balance:** ${totalCoins} coins`,
                    color: 0x00ff00,
                    footer: { text: `Payment ID: ${deposit.invoice_id}` }
                }]
            });
        } catch (dmError) {
            console.error('Failed to send DM:', dmError);
        }
    }
}
module.exports = PaymentChecker;