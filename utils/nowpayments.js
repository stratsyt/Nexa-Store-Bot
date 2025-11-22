const axios = require('axios');
const config = require('../config.json');
class NOWPaymentsClient {
    constructor() {
        this.apiKey = config.nowpayments.apiKey;
        this.baseUrl = 'https://api.nowpayments.io/v1';
    }
    async createPayment(amount, currency, orderId, metadata = {}) {
        try {
            const paymentData = {
                price_amount: amount,
                price_currency: 'USD',
                pay_currency: currency,
                order_id: orderId,
                order_description: `Discord Bot Deposit - ${metadata.coins} coins`
            };
            console.log('Payment request data:', paymentData);
            const response = await axios.post(`${this.baseUrl}/payment`, paymentData, {
                headers: {
                    'x-api-key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        } catch (error) {
            console.error('NOWPayments create payment error:', error.response?.data || error.message);
            throw error;
        }
    }
    async getPaymentStatus(paymentId) {
        try {
            const response = await axios.get(`${this.baseUrl}/payment/${paymentId}`, {
                headers: {
                    'x-api-key': this.apiKey
                }
            });
            return response.data;
        } catch (error) {
            console.error('NOWPayments get payment error:', error.response?.data || error.message);
            throw error;
        }
    }
    async getAvailableCurrencies() {
        try {
            const response = await axios.get(`${this.baseUrl}/currencies`, {
                headers: {
                    'x-api-key': this.apiKey
                }
            });
            return response.data.currencies;
        } catch (error) {
            console.error('NOWPayments get currencies error:', error.response?.data || error.message);
            throw error;
        }
    }
}
module.exports = NOWPaymentsClient;