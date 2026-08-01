# Gerar o APK do Estaca GPS no Android Studio

O projeto já está configurado com o Capacitor (`capacitor.config.ts`).
O app nativo abre o site publicado (`https://geo-stake-finder.lovable.app`) dentro
de uma WebView, e o modo offline (service worker) continua funcionando: as estacas,
o cálculo do GPS e os tiles de satélite já visitados ficam guardados no aparelho.

## 1. No seu computador

Pré-requisitos: Node.js 20+, Android Studio (com SDK 34+) e Java 17.

```bash
git clone <url-do-seu-repositorio-github>
cd <pasta-do-projeto>
npm install
npx cap add android
npx cap sync android
```

> Se aparecer erro de "webDir not found", rode `npm run build` antes do `cap add`.

## 2. Permissões de GPS

Abra `android/app/src/main/AndroidManifest.xml` e confirme que existem, dentro de `<manifest>`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```

## 3. Abrir no Android Studio

```bash
npx cap open android
```

Espere o Gradle sincronizar (barra de progresso no rodapé).

## 4. Criar a chave de assinatura (uma única vez)

No terminal, dentro da pasta `android`:

```bash
keytool -genkey -v -keystore estaca-gps.keystore -alias estacagps \
  -keyalg RSA -keysize 2048 -validity 10000
```

Guarde bem o arquivo `.keystore` e a senha — sem eles não dá para atualizar o app depois.

## 5. Gerar o APK release

No Android Studio:

1. Menu **Build → Generate Signed App Bundle / APK…**
2. Escolha **APK** → Next
3. **Key store path**: selecione `estaca-gps.keystore`, informe as senhas e o alias `estacagps` → Next
4. Build variant: **release**, marque **V1** e **V2 Signature Versions** → **Create**

O arquivo sai em:

```
android/app/build/outputs/apk/release/app-release.apk
```

## 6. Instalar no celular

Copie o `.apk` para o aparelho e abra-o. O Android vai pedir para permitir
"instalar apps de fontes desconhecidas" — aceite. Na primeira abertura, permita
o acesso à localização **o tempo todo / durante o uso** para o GPS funcionar.

## Atualizações

Como o app carrega o site publicado, qualquer alteração feita e publicada no
Lovable aparece automaticamente no APK já instalado — não precisa gerar um novo
APK, exceto se mudar o ícone, o nome ou as permissões.

## Alternativa: app 100% embarcado (sem servidor)

Se quiser que o APK carregue os arquivos de dentro do próprio aparelho,
remova o bloco `server` de `capacitor.config.ts`, gere um build estático do site,
copie-o para `dist/` e rode `npx cap sync android`. Nesse modo, o mapa de satélite
ainda precisa de internet na primeira vez para baixar os tiles.
