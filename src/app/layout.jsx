import "./globals.css";

export const metadata = {
  title: "NebTech Store",
  description: "Point of Sale & Inventory Management",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
