const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { checkAdmin } = require('../utils/auth');
const { getAllProducts, getAllKeys, getAllUsers, getAllBlacklisted } = require('../utils/database');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('excel')
        .setDescription('Export database to Excel file')
        .addStringOption(option =>
            option.setName('database')
                .setDescription('Select database to export')
                .setRequired(true)
                .addChoices(
                    { name: 'Products (store.db)', value: 'products' },
                    { name: 'Keys (keys.db)', value: 'keys' },
                    { name: 'Users (user.db)', value: 'users' },
                    { name: 'Blacklisted (blacklisted.db)', value: 'blacklisted' }
                )),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        await interaction.deferReply({ ephemeral: true });
        const database = interaction.options.getString('database');
        try {
            let data = [];
            let filename = '';
            switch (database) {
                case 'products':
                    data = await getAllProducts();
                    filename = 'products.xlsx';
                    data = data.map(product => ({
                        Name: product.name,
                        Price: product.price,
                        Cooldown: product.cooldown,
                        'Cookie Mode': product.cookieMode ? 'Yes' : 'No',
                        Stock: product.stock,
                        'Created At': product.createdAt
                    }));
                    break;
                case 'keys':
                    data = await getAllKeys();
                    filename = 'keys.xlsx';
                    data = data.map(key => ({
                        'Key Code': key.key_code,
                        'Coin Amount': key.coin_amount,
                        Redeemed: key.redeemed ? 'Yes' : 'No',
                        'Redeemed By': key.redeemed_by || 'N/A',
                        'Created At': key.created_at,
                        'Redeemed At': key.redeemed_at || 'N/A'
                    }));
                    break;
                case 'users':
                    data = await getAllUsers();
                    filename = 'users.xlsx';
                    data = data.map(user => ({
                        'User ID': user.id,
                        Coins: user.coins
                    }));
                    break;
                case 'blacklisted':
                    data = await getAllBlacklisted();
                    filename = 'blacklisted.xlsx';
                    data = data.map(entry => ({
                        'User ID': entry.user_id,
                        'Blacklisted At': entry.blacklisted_at,
                        'Blacklisted By': entry.blacklisted_by
                    }));
                    break;
            }
            if (data.length === 0) {
                await interaction.editReply(`No data found in ${database} database!`);
                return;
            }
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, database);
            const tempDir = path.join(__dirname, '..', 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const filePath = path.join(tempDir, filename);
            XLSX.writeFile(workbook, filePath);
            const attachment = new AttachmentBuilder(filePath, { name: filename });
            await interaction.editReply({
                content: `Excel file generated for ${database} database (${data.length} records):`,
                files: [attachment]
            });
            setTimeout(() => {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }, 30000);
        } catch (error) {
            console.error(error);
            await interaction.editReply('Failed to generate Excel file!');
        }
    },
};