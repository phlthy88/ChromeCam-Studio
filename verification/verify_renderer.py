from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream"
            ]
        )
        page = browser.new_page()

        try:
            # Go to the app
            print("Navigating to app...")
            page.goto("http://localhost:3002/")

            # Wait for the app to load
            print("Waiting for title...")
            expect(page).to_have_title("ChromeCam Studio")

            # Wait for video element to be present (indicating camera stream attempted)
            print("Waiting for video element...")
            page.wait_for_selector("video", timeout=10000)

            # Wait a bit to ensure render loop is running and canvas is drawing
            print("Waiting for render loop...")
            page.wait_for_timeout(3000)

            # Take a screenshot of the initial state
            page.screenshot(path="verification/running.png")
            print("Running screenshot taken")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
