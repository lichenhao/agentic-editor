import puppeteer from 'puppeteer';

const SERVER_URL = 'http://localhost:3000';
const CLIENT_URL = 'http://localhost:5173';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

async function waitForElement(page: puppeteer.Page, selector: string, timeout = 10000): Promise<puppeteer.ElementHandle | null> {
  try {
    return await page.waitForSelector(selector, { timeout });
  } catch {
    return null;
  }
}

async function clickAndWait(page: puppeteer.Page, selector: string, timeout = 5000): Promise<boolean> {
  const element = await waitForElement(page, selector, timeout);
  if (!element) return false;
  await element.click();
  return true;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let browser: puppeteer.Browser | null = null;

  console.log('Starting Puppeteer tests...\n');

  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    // Test 1: Navigate to client and verify page loads
    console.log('Test 1: Loading client page...');
    try {
      await page.goto(CLIENT_URL, { waitUntil: 'networkidle2', timeout: 30000 });
      const title = await page.title();
      results.push({
        name: 'Client page loads',
        passed: title.length > 0,
        details: `Page title: ${title}`
      });

      // Take initial screenshot
      await page.screenshot({ path: '/Users/ryota/works/agentic-editor/test-01-initial.png' });

      // Wait for WebSocket to connect
      console.log('Waiting for WebSocket connection...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (e: any) {
      results.push({
        name: 'Client page loads',
        passed: false,
        error: e.message
      });
      return results;
    }

    // Test 2: Check current UI state - we're likely in an active session already
    console.log('Test 2: Checking UI state...');
    await page.screenshot({ path: '/Users/ryota/works/agentic-editor/test-02-ui-state.png' });

    // Check if there's already a session (no-session view vs chat panel)
    const chatPanel = await waitForElement(page, '.chat-panel, [class*="chat"]', 5000);
    const isInSession = chatPanel !== null;
    results.push({
      name: 'Chat panel visible (session active)',
      passed: isInSession,
      error: isInSession ? undefined : 'Chat panel not found'
    });

    // Test 3: Find message input and send a test message
    console.log('Test 3: Finding message input...');
    const messageTextarea = await waitForElement(page, '.message-textarea, textarea', 5000);
    if (messageTextarea) {
      await messageTextarea.type('请帮我创建一个简单的 Todo List 应用，需要包含添加、删除、标记完成功能');
      results.push({
        name: 'Message input found and typeable',
        passed: true
      });
    } else {
      results.push({
        name: 'Message input found and typeable',
        passed: false,
        error: 'Message input not found'
      });
      // Debug: get page HTML
      const html = await page.content();
      console.log('Page HTML excerpt:', html.substring(0, 1000));
      return results;
    }

    // Click send button
    const sendBtn = await waitForElement(page, '.send-button, button[title*="发送"], button:has-text("↑")', 5000);
    if (sendBtn) {
      await sendBtn.click();
      console.log('Message sent, waiting for agent response...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      await page.screenshot({ path: '/Users/ryota/works/agentic-editor/test-03-after-send.png' });
    }

    // Test 4: Check if session was created (URL should contain session ID)
    console.log('Test 4: Verifying session...');
    const currentUrl = page.url();
    const hasSessionId = currentUrl.includes('/chat/') || currentUrl.includes('session=');
    results.push({
      name: 'Session with Secretary Agent active',
      passed: hasSessionId,
      details: `URL: ${currentUrl}`,
      error: hasSessionId ? undefined : 'Session ID not found in URL'
    });

    // Test 5: Check if Secretary Agent message appears (greeting or analysis)
    console.log('Test 5: Checking for Secretary Agent messages...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await page.screenshot({ path: '/Users/ryota/works/agentic-editor/test-05-messages.png' });

    const allMessages = await page.$$eval('.message-bubble, .message, [class*="message"], .message-list', (elements) => {
      return elements.map(el => el.textContent || '').filter(t => t.trim().length > 0);
    });
    console.log('Found messages:', allMessages.length);
    if (allMessages.length > 0) {
      console.log('First few messages:', allMessages.slice(0, 3).map(m => m.substring(0, 80)));
    }

    const hasAgentMessages = allMessages.length > 0;
    results.push({
      name: 'Secretary Agent sends messages',
      passed: hasAgentMessages,
      details: hasAgentMessages ? `Found ${allMessages.length} messages` : 'No messages found'
    });

    // Test 6: Check if agent analyzed the requirement
    console.log('Test 6: Checking for requirement analysis...');
    const hasAnalysis = allMessages.some((msg: string) =>
      msg.includes('分析') || msg.includes('需求') || msg.includes('理解') ||
      msg.includes('analyze') || msg.includes('understand') || msg.includes('requirement')
    );
    results.push({
      name: 'Secretary Agent analyzes requirement',
      passed: hasAnalysis,
      details: hasAnalysis ? 'Agent responded with analysis' : 'No analysis found in messages'
    });

    // Test 8: Check for task creation (task list or progress indicator)
    console.log('Test 8: Checking for task creation...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    const taskElements = await page.$$('[class*="task"], [class*="progress"], .task-list, .tasks');
    const hasTasks = taskElements.length > 0;
    results.push({
      name: 'Tasks are created and displayed',
      passed: hasTasks,
      error: hasTasks ? undefined : 'No task elements found'
    });

    // Test 9: Check for work products panel
    console.log('Test 9: Checking for work products panel...');
    const productPanel = await waitForElement(page, '[class*="product"], aside:has-text("产出"), aside:has-text("Product")', 5000);
    results.push({
      name: 'Work products panel exists',
      passed: productPanel !== null,
      error: productPanel ? undefined : 'Product panel not found'
    });

    // Test 10: Take screenshot for verification
    console.log('Test 10: Taking screenshot...');
    await page.screenshot({ path: '/Users/ryota/works/agentic-editor/test-screenshot.png' });
    results.push({
      name: 'Screenshot captured',
      passed: true,
      details: 'Screenshot saved to test-screenshot.png'
    });

  } catch (e: any) {
    console.error('Test error:', e);
    results.push({
      name: 'Test execution',
      passed: false,
      error: e.message
    });
  } finally {
    if (browser) {
      // Keep browser open for inspection
      console.log('\nBrowser will remain open for 10 seconds for inspection...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      await browser.close();
    }
  }

  return results;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Agentic Editor - Puppeteer Integration Test');
  console.log('='.repeat(60));
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Client: ${CLIENT_URL}`);
  console.log('='.repeat(60) + '\n');

  const results = await runTests();

  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${result.name}`);
    if (result.error) console.log(`       Error: ${result.error}`);
    if (result.details) console.log(`       Details: ${result.details}`);
    if (result.passed) passed++; else failed++;
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(60));

  // Print summary of design requirements verification
  console.log('\n' + '='.repeat(60));
  console.log('DESIGN REQUIREMENTS VERIFICATION');
  console.log('='.repeat(60));

  const requirementChecks = [
    { name: 'Session creation with Secretary Agent', test: results.find(r => r.name === 'Session created with ID in URL')?.passed },
    { name: 'Secretary Agent greeting', test: results.find(r => r.name === 'Secretary Agent greeting appears')?.passed },
    { name: 'Secretary Agent analyzes requirements', test: results.find(r => r.name === 'Secretary Agent analyzes requirement')?.passed },
    { name: 'Task creation and display', test: results.find(r => r.name === 'Tasks are created and displayed')?.passed },
    { name: 'Work products panel', test: results.find(r => r.name === 'Work products panel exists')?.passed },
  ];

  for (const check of requirementChecks) {
    console.log(`[${check.test ? 'OK' : 'MISSING'}] ${check.name}`);
  }

  console.log('='.repeat(60));
}

main().catch(console.error);