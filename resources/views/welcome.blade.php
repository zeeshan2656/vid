<?php
use App\Services\SettingService;

// Fetch ALL settings in a single cached DB query (was 6 individual DB hits)
$settings   = SettingService::getAll();
$headCode   = $settings['custom_head_code']       ?? '';
$bodyStartCode = $settings['custom_body_start_code'] ?? '';
$bodyEndCode   = $settings['custom_body_end_code']   ?? '';
$gaId       = $settings['google_analytics_id']      ?? '';
$gtmId      = $settings['google_tag_manager_id']    ?? '';
$gscCode    = $settings['google_search_console_code'] ?? '';
$clarityId  = $settings['microsoft_clarity_id']     ?? '';
$pixelId    = $settings['meta_pixel_id']            ?? '';
$siteName   = $settings['site_name']                ?? 'FreeHub Live';
$siteDesc   = $settings['site_description']         ?? 'Ultra-fast video & reels platform.';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $siteName }} - Ultra-Fast Video &amp; Reels</title>
    <meta name="description" content="{{ $siteDesc }}">
    <meta name="robots" content="index, follow">

    {{-- DNS prefetch for third-party domains --}}
    <link rel="dns-prefetch" href="//www.googletagmanager.com">
    <link rel="dns-prefetch" href="//www.google-analytics.com">
    <link rel="dns-prefetch" href="//www.clarity.ms">
    <link rel="dns-prefetch" href="//connect.facebook.net">

    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.jsx'])

    {{-- Google Analytics --}}
    @if(!empty($gaId))
    <script async src="https://www.googletagmanager.com/gtag/js?id={{ $gaId }}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '{{ $gaId }}');
    </script>
    @endif

    {{-- Google Tag Manager --}}
    @if(!empty($gtmId))
    <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','{{ $gtmId }}');</script>
    @endif

    {{-- Google Search Console --}}
    @if(!empty($gscCode))
      @if(strpos($gscCode, '<meta') !== false)
        {!! $gscCode !!}
      @else
        <meta name="google-site-verification" content="{{ $gscCode }}" />
      @endif
    @endif

    {{-- Microsoft Clarity --}}
    @if(!empty($clarityId))
    <script type="text/javascript">
        (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window,document,"clarity","script","{{ $clarityId }}");
    </script>
    @endif

    {{-- Meta Pixel Code --}}
    @if(!empty($pixelId))
    <script>
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '{{ $pixelId }}');
    fbq('track', 'PageView');
    </script>
    <noscript><img height="1" width="1" style="display:none"
    src="https://www.facebook.com/tr?id={{ $pixelId }}&ev=PageView&noscript=1"
    /></noscript>
    @endif

    {{-- Custom Head Code --}}
    @if(!empty($headCode))
    {!! $headCode !!}
    @endif
</head>
<body style="margin: 0; background-color: #050508; color: #ffffff; font-family: 'Instrument Sans', sans-serif;">
    {{-- Google Tag Manager (noscript) --}}
    @if(!empty($gtmId))
    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id={{ $gtmId }}"
    height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
    @endif

    {{-- Custom Body Start Code --}}
    @if(!empty($bodyStartCode))
    {!! $bodyStartCode !!}
    @endif

    <div id="root"></div>

    {{-- Custom Body End Code --}}
    @if(!empty($bodyEndCode))
    {!! $bodyEndCode !!}
    @endif
</body>
</html>
