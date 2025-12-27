from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Verify Public Event Registration Modal
        # Open index.html directly from file system
        page.goto("file:///app/frontend/index.html")

        # Check if the page loaded
        print(f"Loaded page: {page.title()}")

        # Click on a "Join Tournament" button (mocking the user action)
        # Note: Since the backend is not running or unreachable, the event list might be empty.
        # We need to manually inject a mock event into the grid to test the modal opening.
        page.evaluate("""
            const grid = document.getElementById('events-grid');
            grid.innerHTML = `
                <div class="hover-card bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
                    <div class="p-6">
                        <h3 class="text-xl font-bold text-gray-800 mb-2">Mock Event</h3>
                        <button id="mock-join-btn" onclick="joinEvent(999, 'Mock Event')" class="w-full bg-blue-600 text-white font-bold py-2 rounded-lg">Join Tournament</button>
                    </div>
                </div>`;
            document.getElementById('loading-events').classList.add('hidden');
        """)

        # Click the mock button
        page.click("#mock-join-btn")

        # Check if modal is visible
        modal = page.locator("#join-modal")
        if modal.is_visible():
            print("Join Modal is visible.")
            page.screenshot(path="/home/jules/verification/public_modal.png")
        else:
            print("Join Modal NOT visible.")

        # 2. Verify Admin Search/Filter/Edit
        page.goto("file:///app/frontend/admin.html")
        print(f"Loaded page: {page.title()}")

        # Bypass login by setting token
        page.evaluate("localStorage.setItem('k10_token', 'mock_token')")
        page.reload()

        # Inject mock inventory data
        page.evaluate("""
            globalInventory = [
                {id: 1, game_title: 'One Piece', product_type: 'Single', card_name: 'Luffy', price: 100, stock_quantity: 10, card_id: 'OP01-001'},
                {id: 2, game_title: 'Hololive', product_type: 'Booster Box', card_name: 'Hololive Box', price: 50, stock_quantity: 5, card_id: 'HB01'}
            ];
            applyFilters();
        """)

        # Verify Search
        page.fill("#search-input", "Luffy")
        page.evaluate("applyFilters()") # Trigger filter manually if input event doesn't fire

        # Take screenshot of filtered table
        page.screenshot(path="/home/jules/verification/admin_filtered.png")

        # Verify Edit Modal
        page.click("button:has-text('Edit')")
        edit_modal = page.locator("#edit-modal")
        if edit_modal.is_visible():
            print("Edit Modal is visible.")
            page.screenshot(path="/home/jules/verification/admin_edit_modal.png")

        # Close Edit Modal to clean up
        page.click("button:has-text('Cancel')")

        # Verify Delete Modal
        page.click("button:has-text('Delete')")
        delete_modal = page.locator("#delete-modal")
        if delete_modal.is_visible():
            print("Delete Modal is visible.")
            page.screenshot(path="/home/jules/verification/admin_delete_modal.png")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
