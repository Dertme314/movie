from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:3000')
    time.sleep(2)
    page.screenshot(path='home.png', full_page=True)

    # open the account dropdown
    page.click('.nav-avatar')
    time.sleep(1)
    page.screenshot(path='dropdown.png')

    # open sync modal
    page.click('#settings-sync')
    time.sleep(1)
    page.screenshot(path='sync_modal.png')

    browser.close()
