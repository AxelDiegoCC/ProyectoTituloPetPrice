// src/app/services/settings.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const LS_KEY = 'settings.notifications';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private _enabled = new BehaviorSubject<boolean>(this.readInitial());
  notificationsEnabled$ = this._enabled.asObservable();

  get notificationsEnabled() { return this._enabled.value; }

  setNotificationsEnabled(v: boolean) {
    localStorage.setItem(LS_KEY, v ? '1' : '0');
    this._enabled.next(v);
  }

  private readInitial(): boolean {
    const raw = localStorage.getItem(LS_KEY);
    return raw === null ? true : raw === '1';
  }
}
