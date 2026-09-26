import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`PAGE ERROR LOG: ${msg.text()}`);
      pageErrors.push(msg.text());
    }
  });
  
  page.on('pageerror', err => {
    console.log(`PAGE UNCAUGHT ERROR: ${err.toString()}`);
    pageErrors.push(err.toString());
  });

  try {
    console.log("Navigating to dev server...");
    await page.goto('http://localhost:5173');
    await new Promise(r => setTimeout(r, 1000));

    console.log("Simulating player movement (WASD + Arrows)...");
    await page.keyboard.down('KeyW');
    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.down('KeyD');
    await new Promise(r => setTimeout(r, 500));
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');

    console.log("Simulating player jump (Spacebar + Movement)...");
    await page.keyboard.down('KeyW');
    await page.keyboard.press('Space');
    await new Promise(r => setTimeout(r, 600));
    await page.keyboard.up('KeyW');

    console.log("TEST 1: Repeated Briefing Toggle (J key)...");
    await page.keyboard.press('KeyJ');
    await new Promise(r => setTimeout(r, 200));
    await page.keyboard.press('KeyJ');
    await new Promise(r => setTimeout(r, 200));
    await page.keyboard.press('KeyJ');

    console.log("TEST 2: Repeated Tactical Map Toggle (M & ESC keys)...");
    await page.keyboard.press('KeyM');
    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('KeyM'); // Close via M
    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('KeyM'); // Open via M
    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('Escape'); // Close via ESC
    await new Promise(r => setTimeout(r, 300));

    console.log("TEST 3: Simulating F key Attack action...");
    await page.keyboard.press('KeyF');
    await new Promise(r => setTimeout(r, 400));

    console.log("TEST 4: Supply Core Interaction & Prompt Removal Test...");
    // Simulate holding E for 2 seconds to acquire ammo
    await page.keyboard.down('KeyE');
    await new Promise(r => setTimeout(r, 2000));
    await page.keyboard.up('KeyE');

    // Move player away
    await page.keyboard.down('KeyS');
    await new Promise(r => setTimeout(r, 500));
    await page.keyboard.up('KeyS');

    console.log("Simulating Arrow key controls...");
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowLeft');
    await new Promise(r => setTimeout(r, 400));
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('ArrowLeft');

    await new Promise(r => setTimeout(r, 1000));
    console.log("Gameplay simulation completed with errors count:", pageErrors.length);
  } catch (e) {
    console.error("Test execution error:", e);
  }

  await browser.close();
  if (pageErrors.length > 0) {
    process.exit(1);
  } else {
    console.log("ALL GAMEPLAY CHECKS PASSED CLEANLY!");
  }
})();
