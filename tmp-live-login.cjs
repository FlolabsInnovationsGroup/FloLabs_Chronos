const https = require('https');

function request(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

(async () => {
  const base = 'https://hcmsmnfq5q.us-east-1.awsapprunner.com';
  const form = 'email=' + encodeURIComponent('pm@flolabsinnovations.com') + '&password=' + encodeURIComponent('flchron2026');
  const res = await request(base + '/api/auth/callback/credentials?redirect=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(form)
    },
    body: form,
  });
  console.log(res.status);
  console.log(res.headers.location || '');
  console.log(res.body);
})();
