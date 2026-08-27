const http = require('node:http');

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const match = url.pathname.match(/^\/api\/v2\/product\/(\d+)\.json$/);
  res.setHeader('content-type', 'application/json');
  if (!match) {
    res.writeHead(404);
    res.end('{}');
    return;
  }
  res.writeHead(200);
  res.end(
    JSON.stringify({
      status: 1,
      product: {
        product_name: 'Nutella',
        brands: 'Ferrero',
        nutrition_data_per: '100g',
        nutriments: {
          'energy-kcal_100g': 539,
          proteins_100g: 6.3,
          carbohydrates_100g: 57.5,
          fat_100g: 30.9,
          salt_100g: 0.1,
          sugars_100g: 56.3,
        },
      },
    }),
  );
});

server.listen(4099, '127.0.0.1', () => {
  console.log('off-mock-ready');
});
