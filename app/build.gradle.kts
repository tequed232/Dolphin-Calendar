import java.util.Properties

plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
val appVersion = Regex("APP_VERSION\\s*=\\s*'([^']+)'").find(rootProject.file("web/src/meta.ts").readText())!!.groupValues[1]
val versionParts = appVersion.split('.').map(String::toInt)
val signingFile = rootProject.file("signing.local.properties")
val signing = Properties().apply { if(signingFile.exists()) signingFile.inputStream().use { load(it) } }
android {
    namespace = "com.dolphin.calendar"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.dolphin.calendar" // 正式包身份固定；版本更新不能修改此值。
        minSdk = 26
        targetSdk = 36
        versionName = appVersion
        versionCode = versionParts[0] * 10000 + versionParts[1] * 100 + versionParts.getOrElse(2) { 0 }
    }
    signingConfigs {
        if(signingFile.exists()) create("distribution") {
            storeFile = rootProject.file(signing.getProperty("storeFile"))
            storePassword = signing.getProperty("storePassword")
            keyAlias = signing.getProperty("keyAlias")
            keyPassword = signing.getProperty("keyPassword")
        }
    }
    buildTypes {
        debug { applicationIdSuffix = ".debug"; versionNameSuffix = "" }
        release { isMinifyEnabled = true; isShrinkResources = true; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"); if(signingFile.exists()) signingConfig = signingConfigs.getByName("distribution") }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
}
val buildWeb by tasks.registering(Exec::class) {
    workingDir(rootProject.projectDir)
    commandLine(if(System.getProperty("os.name").startsWith("Windows")) "npm.cmd" else "npm", "run", "build")
    inputs.dir(rootProject.file("web/src")); inputs.file(rootProject.file("package-lock.json")); inputs.file(rootProject.file("web/index.html")); inputs.file(rootProject.file("scripts/build-offline.mjs")); outputs.dir(rootProject.file("web/dist"))
}
val syncWeb by tasks.registering(Sync::class) {
    dependsOn(buildWeb)
    from(rootProject.file("web/dist")) { exclude("Dolphin-Calendar-offline.html") }
    into(layout.projectDirectory.dir("src/main/assets/web"))
}
tasks.named("preBuild") { dependsOn(syncWeb) }
tasks.matching { it.name == "validateSigningRelease" }.configureEach {
    doFirst { check(signingFile.exists()) { "正式升级包必须使用原有发行签名，请恢复 signing.local.properties 和原密钥。" } }
}
dependencies { implementation("androidx.webkit:webkit:1.12.1"); implementation("androidx.core:core-ktx:1.15.0"); testImplementation("junit:junit:4.13.2") }
