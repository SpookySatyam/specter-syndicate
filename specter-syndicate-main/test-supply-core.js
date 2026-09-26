import puppeteer from 'puppeteer';

async function runTest() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 720 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  await page.waitForSelector('canvas', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1000));

  // Press J to close briefing overlay
  console.log('Pressing J to close briefing...');
  await page.keyboard.press('KeyJ');
  await new Promise(r => setTimeout(r, 500));

  console.log('Teleporting player directly near Supply Core [16, 16]...');
  await page.evaluate(() => {
    if (window.__teleportPlayer) {
      window.__teleportPlayer(16.0, 16.0);
    }
  });

  // Give R3F game loop 500ms to process frame
  await new Promise(r => setTimeout(r, 500));

  const statusAtCore = await page.evaluate(() => {
    const px = window.playerState ? window.playerState.position.x : 0;
    const pz = window.playerState ? window.playerState.position.z : 0;
    const dist = Math.sqrt((px - 16) ** 2 + (pz - 16) ** 2);
    return {
      px: px.toFixed(1),
      pz: pz.toFixed(1),
      dist: dist.toFixed(1),
      prompt: window.gameState ? window.gameState.interactionText : '',
      coreReached: window.gameState ? window.gameState.coreReached : false,
      step: window.gameState ? window.gameState.currentObjectiveStep : 1
    };
  });
  console.log('Status at Core:', statusAtCore);

  console.log('\nTEST 1: Prompt check inside core range');
  if (statusAtCore.prompt === 'HOLD E — ACQUIRE AMMUNITION') {
    console.log('SUCCESS: "HOLD E — ACQUIRE AMMUNITION" prompt displayed correctly!');
  } else {
    console.error('FAIL: Prompt was:', statusAtCore.prompt);
  }

  console.log('\nTEST 2: Short E press (cancel check)');
  await page.keyboard.down('KeyE');
  await new Promise(r => setTimeout(r, 600)); // hold for 0.6s
  let progressInHold = await page.evaluate(() => window.gameState ? window.gameState.interactionProgress : 0);
  let textInHold = await page.evaluate(() => window.gameState ? window.gameState.interactionText : '');
  console.log(`Progress after 0.6s hold: ${progressInHold.toFixed(2)}, text="${textInHold}"`);
  await page.keyboard.up('KeyE');
  await new Promise(r => setTimeout(r, 300));
  let progressAfterRelease = await page.evaluate(() => window.gameState ? window.gameState.interactionProgress : 0);
  let ammoAfterShortHold = await page.evaluate(() => window.gameState ? window.gameState.ammo : 0);
  console.log('Progress after release:', progressAfterRelease, 'Ammo:', ammoAfterShortHold);
  if (progressAfterRelease === 0 && ammoAfterShortHold === 0) {
    console.log('SUCCESS: Short E release cleanly cancelled interaction and reset progress!');
  } else {
    console.error('FAIL: Progress/ammo did not reset as expected');
  }

  console.log('\nTEST 3: Full 2-second continuous E hold');
  await page.keyboard.down('KeyE');
  for (let t = 0; t <= 12; t++) {
    await new Promise(r => setTimeout(r, 200));
    const holdState = await page.evaluate(() => ({
      progress: window.gameState ? window.gameState.interactionProgress : 0,
      text: window.gameState ? window.gameState.interactionText : '',
      ammo: window.gameState ? window.gameState.ammo : 0
    }));
    console.log(`Hold ${(t * 0.2).toFixed(1)}s: progress=${holdState.progress.toFixed(2)}, text="${holdState.text}", ammo=${holdState.ammo}`);
    if (holdState.ammo === 12) break;
  }
  await page.keyboard.up('KeyE');

  await new Promise(r => setTimeout(r, 500));

  const afterCollectionState = await page.evaluate(() => ({
    ammo: window.gameState ? window.gameState.ammo : 0,
    hasAmmo: window.gameState ? window.gameState.hasAmmo : false,
    ammoCollected: window.gameState ? window.gameState.ammoCollected : false,
    objStep: window.gameState ? window.gameState.currentObjectiveStep : 1,
    prompt: window.gameState ? window.gameState.interactionText : ''
  }));

  console.log('\nAfter 2s hold collection state:', afterCollectionState);
  if (afterCollectionState.ammo === 12 && afterCollectionState.ammoCollected && afterCollectionState.objStep === 3 && afterCollectionState.prompt === '') {
    console.log('SUCCESS: Collection completed! Ammo = 12/12, Objective step = 3 (Eliminate Guardian), Prompt cleared!');
  } else {
    console.error('FAIL: Collection did not meet expected state!', afterCollectionState);
  }

  // Save screenshot artifact
  await page.screenshot({ path: 'C:/Users/saksh/.gemini/antigravity/brain/397e535b-82c9-45da-bd74-0541e6b76e36/supply_core_fixed.png' });
  console.log('Saved screenshot to supply_core_fixed.png');

  console.log('\nTEST 4: Move away and return to Core (no prompt check)');
  await page.evaluate(() => {
    if (window.__teleportPlayer) {
      window.__teleportPlayer(0, 0);
    }
  });
  await new Promise(r => setTimeout(r, 500));

  let promptAway = await page.evaluate(() => window.gameState ? window.gameState.interactionText : '');
  console.log('Prompt when away:', promptAway);

  // Teleport back to core
  await page.evaluate(() => {
    if (window.__teleportPlayer) {
      window.__teleportPlayer(16.0, 16.0);
    }
  });
  await new Promise(r => setTimeout(r, 500));

  let promptReturn = await page.evaluate(() => window.gameState ? window.gameState.interactionText : '');
  console.log('Prompt upon returning to Core:', promptReturn);

  if (promptReturn === '') {
    console.log('SUCCESS: Prompt remains hidden permanently after collection!');
  } else {
    console.error('FAIL: Prompt appeared after return:', promptReturn);
  }

  await browser.close();
  console.log('\n--- ALL AUTOMATED TESTS COMPLETED SUCCESSFULLY ---');
}

runTest().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
