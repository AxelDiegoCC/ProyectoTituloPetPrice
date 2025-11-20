import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { provideMessaging, getMessaging } from '@angular/fire/messaging';
import { environment } from './environments/environment';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

import { setAssetPath } from '@ionic/core/components';
import { defineCustomElements } from '@ionic/core/loader';
import { addIcons } from 'ionicons';
import {
  add,
  arrowBackOutline,
  bagHandleOutline,
  cartOutline,
  cashOutline,
  checkmarkCircleOutline,
  checkmarkDoneOutline,
  checkmarkOutline,
  chevronDownOutline,
  chevronForwardOutline,
  closeOutline,
  colorPaletteOutline,
  createOutline,
  cubeOutline,
  documentTextOutline,
  downloadOutline,
  ellipse,
  eyeOffOutline,
  eyeOutline,
  gitCompareOutline,
  heart,
  heartOutline,
  homeOutline,
  imageOutline,
  keyOutline,
  lockClosedOutline,
  logoOctocat,
  logOutOutline,
  mailOutline,
  notificationsOutline,
  openOutline,
  optionsOutline,
  pawOutline,
  peopleOutline,
  personOutline,
  pricetagOutline,
  pricetagsOutline,
  searchOutline,
  settingsOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
  star,
  starHalf,
  starOutline,
  storefrontOutline,
  swapVerticalOutline,
  trendingDownOutline,
  trashOutline,
  callOutline,
  calendarOutline,
} from 'ionicons/icons';

setAssetPath(new URL('./build/', document.baseURI).href);
defineCustomElements(window);

addIcons({
  'add': add,
  'arrow-back-outline': arrowBackOutline,
  'bag-handle-outline': bagHandleOutline,
  'cart-outline': cartOutline,
  'cash-outline': cashOutline,
  'checkmark-circle-outline': checkmarkCircleOutline,
  'checkmark-done-outline': checkmarkDoneOutline,
  'checkmark-outline': checkmarkOutline,
  'chevron-down-outline': chevronDownOutline,
  'chevron-forward-outline': chevronForwardOutline,
  'close-outline': closeOutline,
  'color-palette-outline': colorPaletteOutline,
  'create-outline': createOutline,
  'cube-outline': cubeOutline,
  'document-text-outline': documentTextOutline,
  'download-outline': downloadOutline,
  'ellipse': ellipse,
  'eye-off-outline': eyeOffOutline,
  'eye-outline': eyeOutline,
  'git-compare-outline': gitCompareOutline,
  'heart': heart,
  'heart-outline': heartOutline,
  'home-outline': homeOutline,
  'image-outline': imageOutline,
  'key-outline': keyOutline,
  'lock-closed-outline': lockClosedOutline,
  'logo-octocat': logoOctocat,
  'log-out-outline': logOutOutline,
  'mail-outline': mailOutline,
  'notifications-outline': notificationsOutline,
  'open-outline': openOutline,
  'options-outline': optionsOutline,
  'paw-outline': pawOutline,
  'people-outline': peopleOutline,
  'person-outline': personOutline,
  'pricetag-outline': pricetagOutline,
  'pricetags-outline': pricetagsOutline,
  'search-outline': searchOutline,
  'settings-outline': settingsOutline,
  'shield-checkmark-outline': shieldCheckmarkOutline,
  'sparkles-outline': sparklesOutline,
  'star': star,
  'star-half': starHalf,
  'star-outline': starOutline,
  'storefront-outline': storefrontOutline,
  'swap-vertical-outline': swapVerticalOutline,
  'trending-down-outline': trendingDownOutline,
  'trash-outline': trashOutline,
  'call-outline': callOutline,
  'calendar-outline': calendarOutline,
});


bootstrapApplication(AppComponent, {
  providers: [
    /*{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),*/
    provideIonicAngular(),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
    provideMessaging(() => getMessaging())
  ],
});
