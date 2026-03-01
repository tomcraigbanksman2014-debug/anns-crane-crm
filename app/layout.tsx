export const metadata = {
  title: "AnnS Crane CRM",
  description: "Enterprise CRM System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
