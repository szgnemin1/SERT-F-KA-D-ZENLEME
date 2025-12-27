<div align="center">

  <h1>🎓 ProCertify Studio</h1>
  
  <p>
    <strong>Profesyonel Sertifika Tasarım ve Toplu Üretim Fabrikası</strong>
  </p>

  <p>
    <a href="#-son-kullanıcılar-için"> kullanıcı Kılavuzu</a> •
    <a href="#-geliştiriciler-için">💻 Geliştirici Dokümantasyonu</a> •
    <a href="#-kurulum">📦 İndir</a>
  </p>

  ![Version](https://img.shields.io/badge/Versiyon-v1.2.5-blue?style=for-the-badge)
  ![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
  ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
  ![Electron](https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white)
  ![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

  <br />
  <img src="https://via.placeholder.com/1000x500?text=ProCertify+Studio+v1.2.5" alt="ProCertify Studio Ekran Görüntüsü" width="100%">
</div>

---

## 🚀 Proje Hakkında

**ProCertify Studio**, etkinlikler, eğitimler ve kurumlar için geliştirilmiş; internet bağlantısına ihtiyaç duymayan, tamamen güvenli ve yerel çalışan bir sertifika üretim motorudur.

Modern sürükle-bırak arayüzü ile dakikalar içinde şablonunuzu hazırlayabilir, Excel/Liste mantığıyla yüzlerce kişiye özel PDF sertifikayı saniyeler içinde üretebilirsiniz.

---

# 👥 Son Kullanıcılar İçin

Eğer bu uygulamayı sertifika üretmek için kullanacaksanız, ihtiyacınız olan bilgiler burada.

### ✨ Neden ProCertify Studio?

*   **🔒 %100 Güvenli ve Çevrimdışı:** Verileriniz asla bir sunucuya gitmez. Bilgisayarınızda (EXE) çalışır. KVKK/GDPR uyumludur.
*   **🧠 Akıllı Veri Birleştirme (YENİ):** Şablonda `{AD SOYAD}` ve `{Ad Soyad}` gibi farklı yazımlar olsa bile, sistem bunları **tek bir kutuda** birleştirir.
*   **📝 Çok Satırlı Destek (YENİ):** Adres veya uzun açıklama metinleri için genişleyebilen yazı alanları eklendi. "Enter" tuşu ile alt satıra geçebilirsiniz.
*   **🔗 QR ve Metin Senkronizasyonu:** Bir metin alanına ve QR koda aynı etiketi (Örn: `{Firma}`) verirseniz, doldurma ekranında tek seçim yaparak ikisini de aynı anda güncelleyebilirsiniz.
*   **⚡ Toplu Üretim Gücü:** Tek bir şablon yapın, 1000 farklı isim için tek tuşla PDF alın.

### 🔥 Temel Özellikler

| Özellik | Açıklama |
| :--- | :--- |
| **Sürükle & Bırak Editör** | Metinleri, logoları, imzaları ve QR kodları mouse ile kolayca yerleştirin. |
| **Dinamik Yer Tutucular** | `{Ad Soyad}`, `{Tarih}` gibi etiketler koyun, "Doldur" ekranında bu alanları otomatik değiştirin. |
| **İmza Yönetimi** | İmzalarınızı sisteme yükleyin veya doğrudan uygulama içinde çizin. Hangi imzanın hangi alanda kullanılabileceğini kısıtlayın. |
| **Firma & Kısaltma** | Uzun firma isimlerini sertifikaya, kısa kodlarını (Örn: `ACME A.Ş.` -> `ACME`) dosya ismine otomatik yazdırın. |
| **Yedekleme Sistemi** | Tüm projelerinizi, ayarlarınızı ve görsellerinizi tek bir `.json` dosyası olarak yedekleyin/taşıyın. |

### ⌨️ Klavye Kısayolları (Editör Modu)
*   **Yön Tuşları:** Seçili öğeyi 1px hareket ettirir.
*   **Shift + Yön Tuşları:** Seçili öğeyi 10px hareket ettirir.
*   **Delete / Backspace:** Seçili öğeyi siler.

---

# 💻 Geliştiriciler İçin

Eğer bu projeyi geliştirmek, katkıda bulunmak veya kendi EXE dosyanızı derlemek istiyorsanız teknik detaylar burada.

### 🛠️ Teknoloji Yığını

Bu proje, modern web teknolojilerinin gücünü masaüstü deneyimiyle birleştirir.

*   **Core:** React 18, TypeScript, Vite
*   **Desktop Wrapper:** Electron.js (IPC, Native File System)
*   **Styling:** Tailwind CSS (Utility-first)
*   **PDF Engine:** jsPDF (Client-side generation)
*   **Icons:** Lucide React

### 📂 Proje Yapısı

```
src/
├── components/      # UI Bileşenleri (CanvasEditor, SignaturePad vb.)
├── services/        # Yardımcı servisler (Gemini AI vb.)
├── types.ts         # TypeScript arayüzleri (Project, Element, Company vb.)
├── constants.ts     # Sabitler (Fontlar, Şablonlar)
├── App.tsx          # Ana Uygulama Mantığı ve State Yönetimi
└── main.js          # Electron Ana Süreci (Main Process)
```

### ⚙️ Kurulum ve Çalıştırma

Projeyi yerel ortamınızda ayağa kaldırmak için:

1.  **Depoyu Klonlayın:**
    ```bash
    git clone https://github.com/szgnemin1/ProCertify.git
    cd ProCertify
    ```

2.  **Bağımlılıkları Yükleyin:**
    ```bash
    npm install
    ```

3.  **Geliştirme Modunda Çalıştırın (HMR Destekli):**
    ```bash
    npm run dev
    ```
    *Not: Bu komut sadece tarayıcıda çalıştırır. Electron özellikleri (Dosya sistemi vb.) simüle edilir.*

4.  **Electron Geliştirme Modu:**
    ```bash
    npm run electron:start
    ```
    *Uygulamayı Electron penceresi içinde başlatır.*

### 📦 EXE Olarak Paketleme (Build)

Uygulamayı dağıtılabilir bir `.exe` (Windows) dosyasına dönüştürmek için:

```bash
npm run dist
```

Bu işlem tamamlandığında `release/` klasörü altında kurulum dosyasını (`ProCertify Studio Setup 1.2.5.exe`) bulabilirsiniz.

> **Önemli Not:** `electron-builder` konfigürasyonu `package.json` dosyasındaki `build` alanında yapılmıştır. İkon değiştirmek için `public/favicon.ico` dosyasını güncelleyin.

---

## 🤝 Katkıda Bulunma

Açık kaynak dünyasını seviyoruz! Katkıda bulunmak isterseniz:

1.  Bu depoyu **Fork** edin.
2.  Yeni bir **Branch** oluşturun (`git checkout -b feature/HarikaOzellik`).
3.  Değişikliklerinizi **Commit**leyin (`git commit -m 'Harika özellik eklendi'`).
4.  Branch'inizi **Push**layın (`git push origin feature/HarikaOzellik`).
5.  Bir **Pull Request** oluşturun.

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) altında sunulmuştur. Ticari ve kişisel kullanım için tamamen ücretsizdir.

<div align="center">
  <br />
  <sub>Designed & Developed with ❤️ by ProCertify Team</sub>
</div>