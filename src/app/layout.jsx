import "./globals.css";

export const metadata = {
  title: "Mwananchi Pharmacy",
  description: "Point of Sale & Inventory Management",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport = {
  themeColor: "#0f766e",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
