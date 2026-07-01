/**
 * Hostinger DNS Automation Script
 * 
 * Automatically configures A and CNAME records for the target domain on Hostinger.
 */

const puppeteer = require('puppeteer');
const readline = require('readline');
require('dotenv').config();

// Load configurations with defaults
const TARGET_DOMAIN = process.env.TARGET_DOMAIN || 'quiropodialc.com';
const DNS_ZONE_URL = process.env.DNS_ZONE_URL || `https://hpanel.hostinger.com/hosting/${TARGET_DOMAIN}/dns-zone-editor`;

// Resilient selectors configuration (attributes/text content rather than dynamic classes)
const SELECTORS = {
  // Dropdown/select for DNS record type (A, CNAME, etc.)
  typeSelect: 'select[name="type"], select[id*="type"], [data-testid*="type"]',
  
  // Host/Name input field
  hostInput: 'input[name="name"], input[placeholder="@"], input[placeholder*="host"], input[placeholder*="Name"], input[id*="name"]',
  
  // Points to/Value/Content input field
  pointsToInput: 'input[name="value"], input[placeholder*="Points to"], input[placeholder*="points"], input[placeholder*="IP"], input[name*="content"], input[id*="value"]',
  
  // Submit/Add button
  addButton: 'button[type="submit"], button[data-testid*="add"], button[id*="add"]'
};

// DNS Records to add sequentially
const RECORDS_TO_ADD = [
  { type: 'A', host: '@', value: '185.199.108.153' },
  { type: 'A', host: '@', value: '185.199.109.153' },
  { type: 'A', host: '@', value: '185.199.110.153' },
  { type: 'A', host: '@', value: '185.199.111.153' },
  { type: 'CNAME', host: 'www', value: 'btcwfd.github.io' }
];

/**
 * Creates a console prompt to wait for user input.
 * @param {string} query - The prompt message.
 * @returns {Promise<string>}
 */
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Clears an input field thoroughly using both triple-click and select-all keyboard shortcuts.
 * @param {object} page - Puppeteer page instance.
 * @param {string} selector - Selector for the input field.
 * @param {string} value - Value to type.
 */
async function clearAndType(page, selector, value) {
  console.log(`Locating field: ${selector}`);
  await page.waitForSelector(selector, { timeout: 15000 });
  const input = await page.$(selector);
  
  // Focus the element
  await input.focus();
  
  // Method 1: Triple click to select all text
  await input.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  
  // Method 2: Ctrl+A and Backspace (fallback for input clearing robustness)
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  
  // Type the value with a small delay to simulate human typing
  await page.type(selector, value, { delay: 50 });
}

/**
 * Selects the DNS record type from standard select dropdown or custom SPA elements.
 * @param {object} page - Puppeteer page instance.
 * @param {string} type - DNS record type (e.g. 'A', 'CNAME').
 */
async function selectRecordType(page, type) {
  const selector = SELECTORS.typeSelect;
  await page.waitForSelector(selector, { timeout: 15000 });
  
  const element = await page.$(selector);
  const tagName = await page.evaluate(el => el.tagName.toLowerCase(), element);
  
  if (tagName === 'select') {
    console.log(`Standard select tag found. Selecting option "${type}"...`);
    await page.select(selector, type);
  } else {
    console.log(`Custom dropdown found. Clicking to open options...`);
    await element.click();
    await new Promise(r => setTimeout(r, 600)); // allow dropdown animation
    
    // Evaluate in DOM to find the option matching text
    const optionSelected = await page.evaluate((typeText) => {
      const elements = Array.from(document.querySelectorAll('div, li, button, a, span'));
      const option = elements.find(el => el.textContent.trim().toUpperCase() === typeText.toUpperCase());
      if (option) {
        option.click();
        return true;
      }
      return false;
    }, type);
    
    if (!optionSelected) {
      console.log(`Could not click option for "${type}" via basic text match. Trying aria/name fallback...`);
      const clicked = await page.evaluate((typeText) => {
        const option = document.querySelector(`[aria-label*="${typeText}"], [name*="${typeText}"], [id*="${typeText}"]`);
        if (option) {
          option.click();
          return true;
        }
        return false;
      }, type);
      
      if (!clicked) {
        throw new Error(`Failed to select record type "${type}". Please check the dropdown elements manually.`);
      }
    }
  }
}

/**
 * Clicks the Add Record button using text content match or fallback selectors.
 * @param {object} page - Puppeteer page instance.
 */
async function clickAddButton(page) {
  // Resilient text-based click
  const clickedByText = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const target = buttons.find(b => {
      const txt = b.textContent.trim().toLowerCase();
      return txt.includes('add') || txt.includes('confirm') || txt.includes('save') || txt.includes('crear') || txt.includes('agregar');
    });
    if (target) {
      target.click();
      return true;
    }
    return false;
  });
  
  if (clickedByText) {
    console.log('Clicked "Add Record" button using text match.');
  } else {
    console.log('Resilient button text search did not find a button. Clicking fallback selector...');
    await page.waitForSelector(SELECTORS.addButton, { timeout: 10000 });
    await page.click(SELECTORS.addButton);
  }
}

/**
 * Optional self-healing check for confirmation or duplicate record modals.
 * @param {object} page - Puppeteer page instance.
 */
async function handlePotentialModals(page) {
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    const modalButtons = Array.from(document.querySelectorAll('button'));
    const confirmBtn = modalButtons.find(b => {
      const text = b.textContent.toLowerCase();
      return text.includes('confirm') || text.includes('yes') || text.includes('accept') || text.includes('entendido') || text.includes('continuar');
    });
    if (confirmBtn && confirmBtn.getBoundingClientRect().height > 0) {
      confirmBtn.click();
      console.log('Auto-handled active confirmation/modal button.');
    }
  });
}

/**
 * Main function executing the automation flow.
 */
async function main() {
  console.log('=== Hostinger DNS Automation ===');
  console.log(`Target Domain: ${TARGET_DOMAIN}`);
  console.log(`DNS Zone URL:  ${DNS_ZONE_URL}\n`);
  
  // R1: Launch browser with automation spoofing and maximized viewport
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--excludeSwitches=enable-automation',
      '--disable-infobars'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });

  try {
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    
    // Additional spoofing to avoid basic detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Navigate to Hostinger Login Page
    console.log('Navigating to Hostinger login portal...');
    await page.goto('https://hpanel.hostinger.com', { waitUntil: 'domcontentloaded' }).catch(e => console.log('Navigation warning:', e.message));
    
    console.log('\n======================================================');
    console.log('STATUS: PAUSED FOR MANUAL LOGIN');
    console.log('1. Please perform manual login/2FA in the opened browser window.');
    console.log('2. Once logged in and on the dashboard, return to this terminal.');
    console.log('3. Press [ENTER] below to proceed with DNS setup automation.');
    console.log('======================================================\n');
    
    await askQuestion('Press [ENTER] when successfully logged in: ');
    
    // Navigate directly to the DNS zone editor URL
    console.log(`Navigating directly to DNS Zone Editor URL: ${DNS_ZONE_URL}`);
    await page.goto(DNS_ZONE_URL, { waitUntil: 'domcontentloaded' }).catch(e => console.log('Navigation warning:', e.message));
    
    // Extra grace period for SPA framework elements to mount
    console.log('Waiting 5 seconds for SPA page structure to load completely...');
    await new Promise(r => setTimeout(r, 5000));
    
    // R2: Sequential record addition loop with timeouts
    for (let i = 0; i < RECORDS_TO_ADD.length; i++) {
      const record = RECORDS_TO_ADD[i];
      console.log(`\n----------------------------------------`);
      console.log(`Processing Record [${i + 1}/${RECORDS_TO_ADD.length}]: ${record.type} | ${record.host} -> ${record.value}`);
      
      // Select record type
      console.log(`Setting type to: ${record.type}`);
      await selectRecordType(page, record.type);
      await new Promise(r => setTimeout(r, 500));
      
      // Fill Host / Name field
      console.log(`Setting Host/Name to: ${record.host}`);
      await clearAndType(page, SELECTORS.hostInput, record.host);
      await new Promise(r => setTimeout(r, 500));
      
      // Fill Points to / Value field
      console.log(`Setting Points-To/Value to: ${record.value}`);
      await clearAndType(page, SELECTORS.pointsToInput, record.value);
      await new Promise(r => setTimeout(r, 500));
      
      // Click Add Button
      await clickAddButton(page);
      
      // Self-heal modal clicks (if any dialog prompts appear)
      await handlePotentialModals(page);
      
      // Time delay to allow Hostinger's SPA to submit and update UI state
      const postInsertDelay = 4000;
      console.log(`Waiting ${postInsertDelay / 1000}s for SPA update...`);
      await new Promise(r => setTimeout(r, postInsertDelay));
    }
    
    console.log('\n======================================================');
    console.log('SUCCESS: All 5 DNS records have been processed.');
    console.log('Please verify the records on the Hostinger page.');
    console.log('======================================================\n');
    
    await askQuestion('Press [ENTER] to close browser and exit script: ');
  } catch (error) {
    console.error('\nAn error occurred during automation:', error);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

// Execute automation if run directly
if (require.main === module) {
  main().catch(console.error);
}
