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

import { addIcons } from 'ionicons';
import { mailOutline, lockClosedOutline, chevronBackOutline, personOutline,
        callOutline, searchOutline, starOutline, heartOutline,
        bagOutline, optionsOutline, logOutOutline, eyeOffOutline,
        eyeOutline, trashOutline, createOutline, addOutline } from 'ionicons/icons';

addIcons({
  'mail-outline': mailOutline,
  'lock-closed-outline': lockClosedOutline,
  'chevron-back-outline': chevronBackOutline,
  'person-outline': personOutline,
  'call-outline': callOutline,
  'search-outline': searchOutline,
  'star-outline': starOutline,
  'heart-outline': heartOutline,
  'bag-outline': bagOutline,
  'options-outline': optionsOutline,
  'log-out-outline': logOutOutline,
  'eye-off-outline': eyeOffOutline,
  'eye-outline': eyeOutline,
  'trash-outline': trashOutline,
  'create-outline': createOutline,
  'person-add-outline': addOutline
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
