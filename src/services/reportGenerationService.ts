import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import logger from '../utils/logger';

interface ReportData {
  summary: {
    totalExpenses: number;
    transactionCount: number;
    averageTransaction: number;
    dateRange: {
      startDate: string;
      endDate: string;
    };
    periodComparison?: {
      totalChange: number;
      countChange: number;
    };
  };
  categoryBreakdown: Array<{
    categoryName: string;
    total: number;
    count: number;
    percentage: number;
    color: string;
  }>;
  monthlyTrends: Array<{
    period: string;
    total: number;
    count: number;
    average: number;
  }>;
  topMerchants: Array<{
    merchant: string;
    total: number;
    count: number;
  }>;
  paymentMethods: Array<{
    method: string;
    total: number;
    count: number;
    percentage: number;
  }>;
  rawTransactions: Array<{
    id: string;
    date: Date;
    amount: number;
    description: string;
    merchant?: string;
    category: string;
    paymentMethod: string;
  }>;
}

export async function generatePDFReport(report: any, data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Track pages for proper numbering
      const pages: any[] = [];
      let currentPageIndex = 0;

      // Helper function to check if we need a new page
      const needsNewPage = (requiredSpace: number) => {
        return doc.y + requiredSpace > doc.page.height - 100; // Leave space for footer
      };

      // Helper function to add a new page
      const addNewPage = () => {
        doc.addPage();
        currentPageIndex++;
        return 50; // Return starting Y position
      };

      // Store initial page
      pages.push(doc);

      // Header
      doc.fontSize(20).text('Expense Report', { align: 'center' });
      doc.fontSize(14).text(report.name, { align: 'center' });
      doc.fontSize(10).text(
        `${formatDate(data.summary.dateRange.startDate)} - ${formatDate(data.summary.dateRange.endDate)}`, 
        { align: 'center' }
      );
      doc.moveDown(1);

      // Summary Section
      doc.fontSize(14).text('Summary', { underline: true });
      doc.moveDown(0.5);

      const summaryY = doc.y;
      doc.fontSize(10);
      
      // Left column
      doc.text(`Total Expenses: ${formatCurrency(data.summary.totalExpenses)}`, 50, summaryY);
      doc.text(`Transaction Count: ${data.summary.transactionCount}`, 50);
      doc.text(`Average Transaction: ${formatCurrency(data.summary.averageTransaction)}`, 50);

      // Right column - Period comparison if available
      if (data.summary.periodComparison) {
        doc.text(`Total Change: ${data.summary.periodComparison.totalChange.toFixed(1)}%`, 300, summaryY);
        doc.text(`Count Change: ${data.summary.periodComparison.countChange.toFixed(1)}%`, 300);
      }

      doc.moveDown(1);

      // Category Breakdown
      const categorySpaceNeeded = Math.min(data.categoryBreakdown.length, 10) * 15 + 60; // Estimate space needed
      if (needsNewPage(categorySpaceNeeded)) {
        addNewPage();
        pages.push(doc);
      }

      doc.fontSize(14).text('Spending by Category', { underline: true });
      doc.moveDown(0.5);

      let currentY = doc.y;

      // Table headers
      doc.fontSize(9);
      doc.text('Category', 50, currentY, { width: 150 });
      doc.text('Amount', 200, currentY, { width: 80, align: 'right' });
      doc.text('Count', 280, currentY, { width: 60, align: 'right' });
      doc.text('Percentage', 340, currentY, { width: 80, align: 'right' });
      
      currentY += 15;
      doc.moveTo(50, currentY).lineTo(430, currentY).stroke();
      currentY += 5;

      // Category data
      data.categoryBreakdown.slice(0, 10).forEach(category => {
        if (needsNewPage(15)) {
          currentY = addNewPage();
          pages.push(doc);
        }

        doc.fontSize(8);
        doc.text(category.categoryName, 50, currentY, { width: 150 });
        doc.text(formatCurrency(category.total), 200, currentY, { width: 80, align: 'right' });
        doc.text(category.count.toString(), 280, currentY, { width: 60, align: 'right' });
        doc.text(`${category.percentage.toFixed(1)}%`, 340, currentY, { width: 80, align: 'right' });
        currentY += 12;
      });

      doc.y = currentY;
      doc.moveDown(1);

      // Monthly Trends
      if (data.monthlyTrends.length > 0) {
        const trendsSpaceNeeded = data.monthlyTrends.length * 12 + 60;
        if (needsNewPage(trendsSpaceNeeded)) {
          addNewPage();
          pages.push(doc);
        }
        
        doc.fontSize(14).text('Monthly Trends', { underline: true });
        doc.moveDown(0.5);

        currentY = doc.y;
        doc.fontSize(9);
        doc.text('Period', 50, currentY, { width: 100 });
        doc.text('Amount', 150, currentY, { width: 80, align: 'right' });
        doc.text('Transactions', 230, currentY, { width: 80, align: 'right' });
        doc.text('Average', 310, currentY, { width: 80, align: 'right' });

        currentY += 15;
        doc.moveTo(50, currentY).lineTo(390, currentY).stroke();
        currentY += 5;

        data.monthlyTrends.forEach(trend => {
          if (needsNewPage(12)) {
            currentY = addNewPage();
            pages.push(doc);
          }

          doc.fontSize(8);
          doc.text(formatPeriod(trend.period), 50, currentY, { width: 100 });
          doc.text(formatCurrency(trend.total), 150, currentY, { width: 80, align: 'right' });
          doc.text(trend.count.toString(), 230, currentY, { width: 80, align: 'right' });
          doc.text(formatCurrency(trend.average), 310, currentY, { width: 80, align: 'right' });
          currentY += 12;
        });

        doc.y = currentY;
        doc.moveDown(1);
      }

      // Top Merchants
      if (data.topMerchants.length > 0) {
        const merchantsToShow = Math.min(data.topMerchants.length, 8); // Limit to 8 for space
        const merchantSpaceNeeded = merchantsToShow * 12 + 60;
        if (needsNewPage(merchantSpaceNeeded)) {
          addNewPage();
          pages.push(doc);
        }
        
        doc.fontSize(14).text('Top Merchants', { underline: true });
        doc.moveDown(0.5);

        currentY = doc.y;
        doc.fontSize(9);
        doc.text('Merchant', 50, currentY, { width: 200 });
        doc.text('Amount', 250, currentY, { width: 80, align: 'right' });
        doc.text('Transactions', 330, currentY, { width: 80, align: 'right' });

        currentY += 15;
        doc.moveTo(50, currentY).lineTo(410, currentY).stroke();
        currentY += 5;

        data.topMerchants.slice(0, merchantsToShow).forEach(merchant => {
          if (needsNewPage(12)) {
            currentY = addNewPage();
            pages.push(doc);
          }

          doc.fontSize(8);
          doc.text(merchant.merchant, 50, currentY, { width: 200 });
          doc.text(formatCurrency(merchant.total), 250, currentY, { width: 80, align: 'right' });
          doc.text(merchant.count.toString(), 330, currentY, { width: 80, align: 'right' });
          currentY += 12;
        });
      }

      // Add footers to all pages with correct numbering
      const totalPages = currentPageIndex + 1;
      const footerText = `Generated on ${new Date().toLocaleDateString()}`;
      
      for (let i = 0; i <= currentPageIndex; i++) {
        if (i > 0) doc.switchToPage(i);
        doc.fontSize(8).text(
          `${footerText} - Page ${i + 1} of ${totalPages}`,
          50,
          doc.page.height - 60,
          { align: 'center', width: doc.page.width - 100 }
        );
      }
      
      doc.end();
    } catch (error) {
      logger.error('PDF generation failed:', error);
      reject(error);
    }
  });
}

export async function generateCSVReport(data: ReportData): Promise<Buffer> {
  try {
    const csvRows: string[] = [];
    
    // Header
    csvRows.push('# Expense Report');
    csvRows.push(`# Period: ${data.summary.dateRange.startDate} to ${data.summary.dateRange.endDate}`);
    csvRows.push(`# Total Expenses: ${formatCurrency(data.summary.totalExpenses)}`);
    csvRows.push(`# Transaction Count: ${data.summary.transactionCount}`);
    csvRows.push('');

    // Transactions
    csvRows.push('Date,Description,Amount,Category,Merchant,Payment Method,Recurring');
    
    data.rawTransactions.forEach(transaction => {
      const row = [
        transaction.date.toISOString().split('T')[0],
        `"${transaction.description.replace(/"/g, '""')}"`, // Escape quotes
        transaction.amount.toString(),
        `"${transaction.category}"`,
        `"${transaction.merchant || ''}"`,
        transaction.paymentMethod.replace('_', ' '),
        'No' // This would be based on actual recurring flag if available
      ];
      csvRows.push(row.join(','));
    });

    csvRows.push('');
    csvRows.push('# Category Summary');
    csvRows.push('Category,Amount,Count,Percentage');
    
    data.categoryBreakdown.forEach(category => {
      csvRows.push([
        `"${category.categoryName}"`,
        category.total.toString(),
        category.count.toString(),
        `${category.percentage.toFixed(2)}%`
      ].join(','));
    });

    return Buffer.from(csvRows.join('\n'), 'utf-8');
  } catch (error) {
    logger.error('CSV generation failed:', error);
    throw error;
  }
}

export async function generateExcelReport(report: any, data: ReportData): Promise<Buffer> {
  try {
    const workbook = new ExcelJS.Workbook();
    
    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    
    // Title
    summarySheet.mergeCells('A1:D1');
    summarySheet.getCell('A1').value = report.name;
    summarySheet.getCell('A1').font = { size: 16, bold: true };
    summarySheet.getCell('A1').alignment = { horizontal: 'center' };

    // Period
    summarySheet.mergeCells('A2:D2');
    summarySheet.getCell('A2').value = `${formatDate(data.summary.dateRange.startDate)} - ${formatDate(data.summary.dateRange.endDate)}`;
    summarySheet.getCell('A2').alignment = { horizontal: 'center' };

    // Summary data
    summarySheet.getCell('A4').value = 'Summary';
    summarySheet.getCell('A4').font = { bold: true };
    
    summarySheet.getCell('A5').value = 'Total Expenses:';
    summarySheet.getCell('B5').value = data.summary.totalExpenses;
    summarySheet.getCell('B5').numFmt = '$#,##0.00';

    summarySheet.getCell('A6').value = 'Transaction Count:';
    summarySheet.getCell('B6').value = data.summary.transactionCount;

    summarySheet.getCell('A7').value = 'Average Transaction:';
    summarySheet.getCell('B7').value = data.summary.averageTransaction;
    summarySheet.getCell('B7').numFmt = '$#,##0.00';

    // Category breakdown
    summarySheet.getCell('A9').value = 'Category Breakdown';
    summarySheet.getCell('A9').font = { bold: true };

    const categoryHeaders = ['Category', 'Amount', 'Count', 'Percentage'];
    categoryHeaders.forEach((header, index) => {
      const cell = summarySheet.getCell(10, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    });

    data.categoryBreakdown.forEach((category, index) => {
      const row = 11 + index;
      summarySheet.getCell(row, 1).value = category.categoryName;
      summarySheet.getCell(row, 2).value = category.total;
      summarySheet.getCell(row, 2).numFmt = '$#,##0.00';
      summarySheet.getCell(row, 3).value = category.count;
      summarySheet.getCell(row, 4).value = category.percentage / 100;
      summarySheet.getCell(row, 4).numFmt = '0.00%';
    });

    // Auto-fit columns
    summarySheet.columns.forEach(column => {
      column.width = 15;
    });

    // Transactions sheet
    const transactionSheet = workbook.addWorksheet('Transactions');
    
    const transactionHeaders = ['Date', 'Description', 'Amount', 'Category', 'Merchant', 'Payment Method'];
    transactionHeaders.forEach((header, index) => {
      const cell = transactionSheet.getCell(1, index + 1);
      cell.value = header;
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    });

    data.rawTransactions.forEach((transaction, index) => {
      const row = 2 + index;
      transactionSheet.getCell(row, 1).value = transaction.date;
      transactionSheet.getCell(row, 1).numFmt = 'mm/dd/yyyy';
      transactionSheet.getCell(row, 2).value = transaction.description;
      transactionSheet.getCell(row, 3).value = transaction.amount;
      transactionSheet.getCell(row, 3).numFmt = '$#,##0.00';
      transactionSheet.getCell(row, 4).value = transaction.category;
      transactionSheet.getCell(row, 5).value = transaction.merchant || '';
      transactionSheet.getCell(row, 6).value = transaction.paymentMethod.replace('_', ' ');
    });

    // Auto-fit columns
    transactionSheet.columns.forEach(column => {
      column.width = 20;
    });

    // Monthly trends sheet
    if (data.monthlyTrends.length > 0) {
      const trendsSheet = workbook.addWorksheet('Monthly Trends');
      
      const trendHeaders = ['Period', 'Amount', 'Count', 'Average'];
      trendHeaders.forEach((header, index) => {
        const cell = trendsSheet.getCell(1, index + 1);
        cell.value = header;
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
      });

      data.monthlyTrends.forEach((trend, index) => {
        const row = 2 + index;
        trendsSheet.getCell(row, 1).value = formatPeriod(trend.period);
        trendsSheet.getCell(row, 2).value = trend.total;
        trendsSheet.getCell(row, 2).numFmt = '$#,##0.00';
        trendsSheet.getCell(row, 3).value = trend.count;
        trendsSheet.getCell(row, 4).value = trend.average;
        trendsSheet.getCell(row, 4).numFmt = '$#,##0.00';
      });

      trendsSheet.columns.forEach(column => {
        column.width = 15;
      });
    }

    return await workbook.xlsx.writeBuffer() as Buffer;
  } catch (error) {
    logger.error('Excel generation failed:', error);
    throw error;
  }
}

// Utility functions
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'NGN',
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatPeriod(period: string): string {
  const date = new Date(period);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
}