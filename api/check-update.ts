export default async function handler(req, res) {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    return res.status(500).json({ error: 'Vercel Token veya Project ID yapılandırılmamış.' });
  }

  try {
    // Vercel API'sinden projeye ait en son başarılı (READY) deployment'ı çekiyoruz
    const response = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1&state=READY`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Vercel API isteği başarısız oldu');
    }

    const data = await response.json();
    
    if (data.deployments && data.deployments.length > 0) {
      const latest = data.deployments[0];
      return res.status(200).json({ 
        sha: latest.meta?.githubCommitSha || latest.uid, // GitHub commit SHA veya Vercel Deployment UID
        createdAt: latest.createdAt
      });
    }

    return res.status(404).json({ error: 'Hiçbir deployment bulunamadı.' });
  } catch (error) {
    console.error("Vercel Update Check Error:", error);
    return res.status(500).json({ error: 'Deployment verileri alınırken bir hata oluştu.' });
  }
}
