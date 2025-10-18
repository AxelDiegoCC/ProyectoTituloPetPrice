import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminUsersPanelPage } from './admin-users-panel.page';

describe('AdminUsersPanelPage', () => {
  let component: AdminUsersPanelPage;
  let fixture: ComponentFixture<AdminUsersPanelPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AdminUsersPanelPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
