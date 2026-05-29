UPKK SmartKids - Optimized Structure v3.14

Perubahan utama:
1. index.html, manifest.json, sw.js, offline.html kekal di root.
2. app.js, firebase-config.js, pwa-register.js dipindah ke /src.
3. style.css dipindah ke /assets/css/style.css.
4. logo/avatar dipindah ke /assets/images.
5. admin dipindah ke /admin.
6. data Firebase/rules dipindah ke /data.
7. script maintenance dipindah ke /tools.
8. halaman lama di root dijadikan redirect ringan supaya link/bookmark lama masih serasi.
9. sw.js diringankan supaya admin page dan page duplicate tidak dicache untuk user biasa.

Fail penting untuk deploy:
- index.html
- sw.js
- manifest.json
- offline.html
- /src
- /assets
- /admin
- /data jika mahu simpan seed/rules
