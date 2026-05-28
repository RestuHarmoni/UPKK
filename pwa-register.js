UPKK SmartKids v8.01 STABLE FORM + DEVICE FIX

Base rujukan: UPKK_SmartKids_v7_09_SAME_DEVICE_RELOGIN_FIX.zip

Fix utama:
- Bukan placeholder: full project lengkap.
- Button dan form input dibaiki supaya boleh tekan/taip semula.
- Custom popup tidak block form selepas ditutup.
- Selepas daftar pelajar, setting buka terus dengan nota inline: Sila isi nama penuh pelajar.
- Device ID kekal untuk login semula device yang sama.
- Device management baca/tulis Firebase path users/{accountId}/devices.
- Exam Mode masih unlock sementara.
- Struktur STU account utama + student_1/student_2/student_3 dikekalkan.

File penting:
- index.html
- dashboard.html redirect
- setting.html redirect
- app.js
- style.css
- firebase-config.js
- firebase-database-seed.json
- firebase-rules-mvp.json
- data/questions.json
- assets/logo.webp, avatar-boy.webp, avatar-girl.webp

UPDATE v8.02 KEYBOARD INPUT FIX
- Baiki input nama pelajar, username dan Password/PIN supaya keyboard boleh keluar dan input tidak hilang fokus.
- Elak render semula Setting/Profile ketika user sedang menaip.
- Kekalkan fungsi asal lain tanpa ubah flow utama.


V1_26 PWA LOGO UPDATE
- Logo PWA rasmi ditambah: assets/logo-pwa.png
- Icon PWA PNG ditambah dalam assets/icons/ untuk 512, 192, Apple Touch Icon dan favicon.
- manifest.json, sw.js, pwa-register.js dan cache version dinaikkan ke 1.26.
- Firebase/database/rules tidak diubah.


UPDATE FIREBASE ACCESS CODE STABLE:
- Pendaftaran wajib access code/trial code.
- Latihan trial 30 hari dan Peperiksaan lesen 365 hari disimpan dalam Firebase entitlements.
- Admin boleh urus code di admin-codes.html.
- Import semula firebase-database-seed.json jika mahu contoh kod TRIAL-UPKK-2026 dan EXAM-DEMO-365.


UPDATE FIREBASE ACCESS CODE ADMIN MERGED v3.10
- Buka admin.html untuk semua kawalan admin termasuk cipta/tarik sah access code.
- admin-codes.html hanya redirect ke admin.html#codes.
