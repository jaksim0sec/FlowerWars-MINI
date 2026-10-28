"""Mobile-size browser smoke for the local campaign integration."""
import os
from playwright.sync_api import sync_playwright, expect

URL=os.environ.get("BASE_URL","http://127.0.0.1:10000")
with sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True,args=["--disable-dev-shm-usage"])
    page=browser.new_page(viewport={"width":390,"height":844},device_scale_factor=1)
    errors=[]
    page.on("pageerror",lambda error: errors.append(str(error)))
    page.goto(URL,wait_until="domcontentloaded",timeout=30000)
    panel=page.locator("#campaign-panel")
    expect(panel).to_be_visible(timeout=20000)
    expect(page.locator("#camp-content")).to_contain_text("내 부대")
    page.locator('[data-action="tab"][data-tab="shop"]').click()
    expect(page.locator("#camp-content")).to_contain_text("보급상자")
    page.locator('[data-action="tab"][data-tab="expedition"]').click()
    expect(page.locator('[data-action="begin-expedition"]')).to_be_enabled(timeout=30000)
    page.locator('[data-action="begin-expedition"]').click()
    expect(page.locator("#camp-content")).to_contain_text("1 / 3")
    page.locator('[data-action="launch"]').click()
    expect(panel).to_be_hidden(timeout=30000)
    expect(page.locator("#deployment-tools")).to_be_visible(timeout=30000)
    expect(page.locator('[data-deploy-type="defense"]')).to_be_enabled()
    expect(page.locator('[data-deploy-type="mobile"]')).to_be_disabled()
    expect(page.locator('[data-deploy-type="support"]')).to_be_disabled()
    page.locator("#camp-entry").click()
    expect(panel).to_be_visible()
    expect(page.locator('[data-action="launch"]')).to_be_disabled()
    assert not errors, "Browser JavaScript errors: "+repr(errors)
    print("Campaign mobile smoke passed: camp, shop, expedition, deployment restriction, single active battle")
    browser.close()
