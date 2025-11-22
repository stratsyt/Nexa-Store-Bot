const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const https = require('https');
const http = require('http');
const { checkAdmin } = require('../utils/auth');
const { getAllProducts, getProduct, updateStock, getActualStockCount } = require('../utils/database');
const { getRandomColor } = require('../utils/randomcolor');
const config = require('../config.json');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('restock')
        .setDescription('Restock products from a zip file')
        .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('Upload a zip file containing stock')
                .setRequired(true)),
    async execute(interaction) {
        if (!(await checkAdmin(interaction))) return;
        await interaction.deferReply();
        const attachment = interaction.options.getAttachment('file');
        if (!attachment.name.endsWith('.zip')) {
            await interaction.editReply('Please upload a .zip file!');
            return;
        }
        try {
            const tempDir = path.join(__dirname, '..', 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const zipPath = path.join(tempDir, `restock_${Date.now()}.zip`);
            const file = fs.createWriteStream(zipPath);
            const protocol = attachment.url.startsWith('https') ? https : http;
            await new Promise((resolve, reject) => {
                protocol.get(attachment.url, (response) => {
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                }).on('error', reject);
            });
            const zip = new AdmZip(zipPath);
            const extractPath = path.join(tempDir, `extract_${Date.now()}`);
            zip.extractAllTo(extractPath, true);
            function findInDirectory(dir, targetName, isDir = false) {
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    const stat = fs.statSync(fullPath);
                    if (isDir && stat.isDirectory() && item === targetName) {
                        return fullPath;
                    }
                    if (!isDir && stat.isFile() && item === targetName) {
                        return fullPath;
                    }
                    if (stat.isDirectory()) {
                        const found = findInDirectory(fullPath, targetName, isDir);
                        if (found) return found;
                    }
                }
                return null;
            }
            const products = await getAllProducts();
            const restockResults = [];
            for (const product of products) {
                let stockAdded = 0;
                if (product.cookieMode) {
                    const productDir = findInDirectory(extractPath, product.name, true);
                    if (productDir) {
                        const files = fs.readdirSync(productDir).filter(f => {
                            const filePath = path.join(productDir, f);
                            return fs.statSync(filePath).isFile();
                        });
                        const stockDir = path.join(__dirname, '..', 'stock', product.name);
                        if (!fs.existsSync(stockDir)) {
                            fs.mkdirSync(stockDir, { recursive: true });
                        }
                        for (const file of files) {
                            const sourcePath = path.join(productDir, file);
                            const destPath = path.join(stockDir, `${Date.now()}_${file}`);
                            fs.copyFileSync(sourcePath, destPath);
                            stockAdded++;
                        }
                    }
                } else {
                    const productFile = findInDirectory(extractPath, `${product.name}.txt`, false);
                    if (productFile) {
                        const content = fs.readFileSync(productFile, 'utf8');
                        const lines = content.split('\n').filter(line => line.trim() !== '');
                        const stockFile = path.join(__dirname, '..', 'stock', `${product.name}.txt`);
                        if (lines.length > 0) {
                            const existingContent = fs.existsSync(stockFile) ? fs.readFileSync(stockFile, 'utf8') : '';
                            const newContent = existingContent + (existingContent && !existingContent.endsWith('\n') ? '\n' : '') + lines.join('\n') + '\n';
                            fs.writeFileSync(stockFile, newContent);
                            stockAdded = lines.length;
                        }
                    }
                }
                if (stockAdded > 0) {
                    const actualStock = getActualStockCount(product.name, product.cookieMode);
                    await updateStock(product.name, actualStock);
                    restockResults.push({
                        name: product.name,
                        added: stockAdded,
                        cookieMode: product.cookieMode,
                        totalStock: actualStock
                    });
                }
            }
            fs.unlinkSync(zipPath);
            fs.rmSync(extractPath, { recursive: true, force: true });
            if (restockResults.length === 0) {
                await interaction.editReply('No products were restocked. Make sure the zip file contains matching product names.');
                return;
            }
            let description = '';
            for (const result of restockResults) {
                const emoji = result.cookieMode ? '🍪' : '🔑';
                description += `\`${emoji} ${result.name} - +${result.added} items restocked!\`\n`;
                description += `└ *Total Stock: ${result.totalStock}*\n\n`;
            }
            const embed = new EmbedBuilder()
                .setTitle(':bell: New Stock Ready')
                .setDescription(description.trim())
                .setColor(getRandomColor());
            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Store')
                        .setURL(config.storeLink)
                        .setStyle(ButtonStyle.Link)
                );
            const restockChannel = interaction.guild.channels.cache.get(config.restockChannel);
            if (restockChannel) {
                await restockChannel.send({
                    content: `<@&${config.restockRole}>`,
                    embeds: [embed],
                    components: [button]
                });
                await interaction.editReply(`Restock completed successfully! Notification sent to ${restockChannel.name}`);
            } else {
                await interaction.channel.send({
                    content: `<@&${config.restockRole}>`,
                    embeds: [embed],
                    components: [button]
                });
                await interaction.editReply('Restock completed successfully! (Restock channel not found, sent to current channel)');
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('Failed to restock products!');
        }
    },
};