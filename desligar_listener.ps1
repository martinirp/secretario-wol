$port = 3000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$port/")

try {
    $listener.Start()
} catch {
    # Falhou ao iniciar (provavelmente sem Admin). Sai silenciosamente.
    exit
}

while ($true) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    if ($request.Url.AbsolutePath -eq "/desligar") {
        $buffer = [System.Text.Encoding]::UTF8.GetBytes("Desligando...")
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        $response.Close()
        
        # Desliga o computador em 5 segundos
        shutdown.exe /s /f /t 5
    } else {
        $response.StatusCode = 404
        $response.Close()
    }
}
