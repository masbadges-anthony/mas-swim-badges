FAVICON SET — Installation
==========================

1. Upload all files to the ROOT of your website (e.g. public_html/).

2. Add these lines inside the <head> of every page:

<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1e2a55">

3. Edit site.webmanifest — change "name" and "short_name" to your site's name.

Files included:
- favicon.ico                  (16/32/48/64 multi-size, for browsers)
- favicon-16x16.png            (browser tab)
- favicon-32x32.png            (browser tab, retina)
- favicon-48x48.png            (Windows shortcuts)
- apple-touch-icon.png         (180x180, iPhone/iPad home screen, white bg)
- android-chrome-192x192.png   (Android home screen)
- android-chrome-512x512.png   (Android splash / PWA)
- maskable-icon-512x512.png    (PWA adaptive icon, extra padding)
- mstile-150x150.png           (Windows Start tile)
- site.webmanifest             (PWA manifest)
