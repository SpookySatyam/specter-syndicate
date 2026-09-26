import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`PAGE LOG: ${msg.type()} - ${msg.text()}`);
  });
  
  page.on('pageerror', err => {
    console.log(`PAGE ERROR: ${err.toString()}`);
  });
  
  try {
    await page.goto('http://localhost:5173');
    // wait for 2 seconds to let the canvas crash if it's going to
    await new Promise(r => setTimeout(r, 2000));
  } catch(e) {
    console.error("Navigation error:", e);
  }
  
  await browser.close();
})();
