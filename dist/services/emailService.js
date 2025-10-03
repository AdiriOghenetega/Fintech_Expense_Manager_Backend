"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const logger_1 = __importDefault(require("../utils/logger"));
class EmailService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }
    initializeTransporter() {
        if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            logger_1.default.warn('Email configuration not provided. Email notifications will be disabled.');
            return;
        }
        this.transporter = nodemailer_1.default.createTransport({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT || '465'),
            secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
        // Verify connection
        this.transporter.verify((error) => {
            if (error) {
                logger_1.default.error('Email service connection failed:', error);
                this.transporter = null;
            }
            else {
                logger_1.default.info('Email service connected successfully');
            }
        });
    }
    async sendEmail(options) {
        if (!this.transporter) {
            logger_1.default.warn('Email service not available, skipping email send');
            return false;
        }
        try {
            const mailOptions = {
                from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text || this.htmlToText(options.html),
            };
            const info = await this.transporter.sendMail(mailOptions);
            logger_1.default.info(`Email sent successfully: ${info.messageId}`);
            return true;
        }
        catch (error) {
            logger_1.default.error('Failed to send email:', error);
            return false;
        }
    }
    async sendWelcomeEmail(userEmail, userName) {
        const html = this.generateWelcomeEmailHTML(userName);
        return this.sendEmail({
            to: userEmail,
            subject: 'Welcome to FinTech Dashboard!',
            html,
        });
    }
    async sendBudgetAlert(userEmail, userName, alert) {
        const html = this.generateBudgetAlertHTML(userName, alert);
        return this.sendEmail({
            to: userEmail,
            subject: `Budget Alert: ${alert.categoryName}`,
            html,
        });
    }
    async sendMonthlyReport(userEmail, userName, reportData) {
        const html = this.generateMonthlyReportHTML(userName, reportData);
        return this.sendEmail({
            to: userEmail,
            subject: 'Your Monthly Expense Report',
            html,
        });
    }
    async sendPasswordResetEmail(userEmail, resetToken) {
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        const html = this.generatePasswordResetHTML(resetUrl);
        return this.sendEmail({
            to: userEmail,
            subject: 'Password Reset Request',
            html,
        });
    }
    generateWelcomeEmailHTML(userName) {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to FinTech Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 30px; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { background: #6c757d; color: white; padding: 20px; text-align: center; font-size: 14px; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to FinTech Dashboard! 💰</h1>
            <p>Your intelligent expense management companion</p>
          </div>
          <div class="content">
            <h2>Hello ${userName}!</h2>
            <p>Thank you for joining FinTech Dashboard. We're excited to help you take control of your finances with our AI-powered expense tracking and budgeting tools.</p>
            
            <h3>Get Started:</h3>
            <ul>
              <li>📊 Add your first expense and watch our AI categorize it automatically</li>
              <li>💳 Set up budgets for different spending categories</li>
              <li>📈 Explore analytics to understand your spending patterns</li>
              <li>📋 Generate detailed financial reports</li>
            </ul>
            
            <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Go to Dashboard</a>
            
            <p>If you have any questions, feel free to reach out to our support team.</p>
            
            <p>Best regards,<br>The FinTech Dashboard Team</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 FinTech Dashboard. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    }
    generateBudgetAlertHTML(userName, alert) {
        const alertType = alert.percentage >= 100 ? 'exceeded' : 'approaching';
        const alertColor = alert.percentage >= 100 ? '#dc3545' : '#ffc107';
        const alertIcon = alert.percentage >= 100 ? '🚨' : '⚠️';
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Budget Alert</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${alertColor}; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 30px; }
          .alert-box { background: #fff; border-left: 4px solid ${alertColor}; padding: 20px; margin: 20px 0; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .progress-bar { background: #e9ecef; border-radius: 10px; overflow: hidden; height: 20px; margin: 10px 0; }
          .progress-fill { background: ${alertColor}; height: 100%; transition: width 0.3s ease; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${alertIcon} Budget Alert</h1>
            <p>Your ${alert.categoryName} budget needs attention</p>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>We wanted to let you know that your <strong>${alert.categoryName}</strong> spending has ${alertType} your budget limit.</p>
            
            <div class="alert-box">
              <h3>Budget Summary:</h3>
              <p><strong>Category:</strong> ${alert.categoryName}</p>
              <p><strong>Budget:</strong> $${alert.budgetAmount.toFixed(2)}</p>
              <p><strong>Spent:</strong> $${alert.spent.toFixed(2)}</p>
              <p><strong>Percentage:</strong> ${alert.percentage.toFixed(1)}%</p>
              
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${Math.min(alert.percentage, 100)}%"></div>
              </div>
            </div>
            
            ${alert.percentage >= 100
            ? '<p><strong>You have exceeded your budget by $' + (alert.spent - alert.budgetAmount).toFixed(2) + '.</strong> Consider reviewing your spending in this category.</p>'
            : '<p><strong>You are approaching your budget limit.</strong> You have $' + (alert.budgetAmount - alert.spent).toFixed(2) + ' remaining.</p>'}
            
            <a href="${process.env.FRONTEND_URL}/budgets" class="button">View Budget Details</a>
            
            <p>Best regards,<br>The FinTech Dashboard Team</p>
          </div>
        </div>
      </body>
      </html>
    `;
    }
    generateMonthlyReportHTML(userName, reportData) {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Monthly Expense Report</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 30px; }
          .stat-box { background: #fff; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #28a745; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Monthly Report</h1>
            <p>Your spending summary for ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          </div>
          <div class="content">
            <h2>Hello ${userName},</h2>
            <p>Here's your monthly expense summary:</p>
            
            <div class="stat-box">
              <h3>💰 Total Spent</h3>
              <p style="font-size: 24px; font-weight: bold; color: #28a745;">$${reportData.totalSpent.toFixed(2)}</p>
            </div>
            
            <div class="stat-box">
              <h3>📝 Total Transactions</h3>
              <p style="font-size: 24px; font-weight: bold; color: #17a2b8;">${reportData.transactionCount}</p>
            </div>
            
            <div class="stat-box">
              <h3>🏆 Top Spending Category</h3>
              <p style="font-size: 24px; font-weight: bold; color: #6f42c1;">${reportData.topCategory}</p>
            </div>
            
            ${reportData.reportUrl ?
            `<a href="${reportData.reportUrl}" class="button">Download Full Report</a>` :
            `<a href="${process.env.FRONTEND_URL}/reports" class="button">View Detailed Analytics</a>`}
            
            <p>Keep up the great work managing your finances!</p>
            
            <p>Best regards,<br>The FinTech Dashboard Team</p>
          </div>
        </div>
      </body>
      </html>
    `;
    }
    generatePasswordResetHTML(resetUrl) {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset Request</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #6c757d; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 30px; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Password Reset Request</h1>
          </div>
          <div class="content">
            <p>We received a request to reset your password for your FinTech Dashboard account.</p>
            
            <p>Click the button below to reset your password:</p>
            
            <a href="${resetUrl}" class="button">Reset Password</a>
            
            <div class="warning">
              <p><strong>Important:</strong> This link will expire in 1 hour. If you didn't request this password reset, you can safely ignore this email.</p>
            </div>
            
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #007bff;">${resetUrl}</p>
            
            <p>Best regards,<br>The FinTech Dashboard Team</p>
          </div>
        </div>
      </body>
      </html>
    `;
    }
    htmlToText(html) {
        return html
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }
}
exports.emailService = new EmailService();
//# sourceMappingURL=emailService.js.map