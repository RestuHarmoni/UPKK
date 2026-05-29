# Asset Optimization Report

Perubahan dibuat untuk ringankan logo, avatar dan PWA icon tanpa mengubah fungsi/data app.

## Lokasi asset production
- Logo UI: `assets/images/logo.webp`
- Avatar: `assets/images/avatar-boy.webp`, `assets/images/avatar-girl.webp`
- PWA icon: `assets/icons/`

## Saiz selepas optimasi
| Fail | Dimensi | Saiz |
|---|---:|---:|
| `assets/images/logo.webp` | 500×188 | 21.8 KB |
| `assets/images/avatar-boy.webp` | 256×256 | 10.6 KB |
| `assets/images/avatar-girl.webp` | 256×256 | 10.3 KB |
| `assets/images/logo-pwa.png` | 512×512 | 49.5 KB |
| `assets/icons/icon-192.png` | 192×192 | 10.9 KB |
| `assets/icons/icon-512.png` | 512×512 | 49.5 KB |
| `assets/icons/icon-maskable-512.png` | 512×512 | 49.5 KB |

## Nota
- `index.html`, `offline.html`, dan `src/app.js` kini menggunakan `assets/images/logo.webp` untuk paparan UI.
- `sw.js` tidak lagi cache icon 512 besar sebagai core asset.
- Fail logo asal bersaiz besar dipindahkan ke `legacy/original-assets/` sebagai backup dan tidak digunakan oleh app.
