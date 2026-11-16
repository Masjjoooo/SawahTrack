# SawahTrack MVP

Aplikasi PWA awal untuk mencatat pemilik sawah, petakan, polygon batas sawah di peta citra satelit, pekerjaan bajak/combine, pembayaran, dan pengeluaran.

## Isi project
- `index.html`, `styles.css`, `app.js`: antarmuka dan logika aplikasi.
- `config.js`: konfigurasi Supabase (wajib diisi).
- `supabase.sql`: skema awal database dan RLS.
- `manifest.webmanifest`, `sw.js`: instalasi PWA dan cache shell dasar.

## Menjalankan
1. Buat project di Supabase.
2. Buka SQL Editor, jalankan `supabase.sql`.
3. Salin Project URL dan anon/public key ke `config.js`.
4. Upload seluruh file ke hosting static HTTPS (misalnya Vercel).
5. Buka URL aplikasi dan buat akun.
6. Izinkan akses jaringan dan gunakan peta satelit untuk menggambar polygon.

## Penting sebelum dipakai dengan data sungguhan
Versi ini adalah starter MVP, bukan sistem produksi final. Frontend membutuhkan beberapa penyesuaian backend sebelum dipakai:
- Implementasikan workspace provisioning/invitation melalui Edge Function/server-side; jangan izinkan pengguna menambahkan dirinya ke workspace orang lain.
- Tambahkan `workspace_id` pada payload insert/update di `app.js` (gunakan workspace aktif dari membership).
- Buat proses invite operator dan role management yang aman.
- Perkuat RLS agar operator/viewer/admin punya izin berbeda. Policy awal membatasi data per workspace, tetapi belum memisahkan izin per role.
- Validasi relasi agar `owner_id`, `field_id`, `job_id`, `machine_id` selalu berasal dari workspace yang sama.
- Tambahkan penyimpanan offline antrean perubahan dan sinkronisasi konflik. Service worker saat ini hanya cache shell aplikasi; transaksi database memerlukan internet.
- Tambahkan upload foto ke Supabase Storage, pengelolaan mesin dan musim, detail pembayaran/cicilan, laporan, edit/hapus pekerjaan, audit log, dan ekspor.
- Tambahkan perhitungan luas geodesik yang tervalidasi. Untuk produksi, gunakan PostGIS `geography` atau Turf.js; angka luas dari browser perlu diperlakukan sebagai perkiraan.
- Peta menggunakan Esri World Imagery. Periksa syarat penggunaan/atribusi dan kuota penyedia tile sebelum penggunaan intensif.
- Signup mandiri saat ini membuat workspace pribadi untuk setiap akun. Untuk tim dalam satu workspace, undang akun melalui backend/Edge Function yang memvalidasi admin dan menambahkan membership.

## Struktur tarif
Tarif khusus disimpan pada setiap petakan: `plow_rate_per_box` dan `combine_rate_per_box`. Saat pekerjaan dibuat, tarif dan jumlah kotak disalin ke `job_fields` sebagai snapshot sehingga perubahan tarif berikutnya tidak mengubah riwayat.

## Keamanan
Jangan pernah menaruh Supabase `service_role` key di frontend. Gunakan hanya anon/public key dengan RLS.
