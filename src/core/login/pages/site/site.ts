// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Component } from '@angular/core';
import { IonicPage, NavController, ModalController, NavParams } from 'ionic-angular';
import { CoreAppProvider } from '@providers/app';
import { CoreSitesProvider, CoreSiteCheckResponse } from '@providers/sites';
import { CoreDomUtilsProvider } from '@providers/utils/dom';
import { CoreConfigConstants } from '../../../../configconstants';
import { CoreLoginHelperProvider } from '../../providers/helper';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CoreUrl } from '@classes/utils/url';

/**
 * Page to enter or select the site URL to connect to.
 */
@IonicPage({ segment: 'core-login-site' })
@Component({
    selector: 'page-core-login-site',
    templateUrl: 'site.html',
})
export class CoreLoginSitePage {
    siteForm: FormGroup;
    fixedSites: any[];
    filteredSites: any[];
    fixedDisplay = 'buttons';
    showKeyboard = false;
    filter = '';

    constructor(navParams: NavParams, private navCtrl: NavController, fb: FormBuilder, private appProvider: CoreAppProvider,
            private sitesProvider: CoreSitesProvider, private loginHelper: CoreLoginHelperProvider,
            private modalCtrl: ModalController, private domUtils: CoreDomUtilsProvider) {

        this.showKeyboard = !!navParams.get('showKeyboard');

        let url = '';

        // Load fixed sites if they're set.
        if (this.loginHelper.hasSeveralFixedSites()) {
            this.fixedSites = <any[]> this.loginHelper.getFixedSites();
            this.fixedDisplay = CoreConfigConstants.multisitesdisplay;
            // Autoselect if not defined.
            if (['list', 'listnourl', 'select', 'buttons'].indexOf(this.fixedDisplay) < 0) {
                this.fixedDisplay = this.fixedSites.length > 8 ? 'list' : (this.fixedSites.length > 3 ? 'select' : 'buttons');
            }
            this.filteredSites = this.fixedSites;
            url = this.fixedSites[0].url;
        }

        this.siteForm = fb.group({
            siteUrl: [url, Validators.required]
        });
    }

    /**
     * Try to connect to a site.
     *
     * @param e Event.
     * @param url The URL to connect to.
     */
    connect(e: Event, url: string): void {
        e.preventDefault();
        e.stopPropagation();

        this.appProvider.closeKeyboard();

        if (!url) {
            this.domUtils.showErrorModal('core.login.siteurlrequired', true);

            return;
        }

        if (!this.appProvider.isOnline()) {
            this.domUtils.showErrorModal('core.networkerrormsg', true);

            return;
        }

        url = url.trim();

        const modal = this.domUtils.showModalLoading(),
            siteData = this.sitesProvider.getDemoSiteData(url);

        if (siteData) {
            // It's a demo site.
            this.sitesProvider.getUserToken(siteData.url, siteData.username, siteData.password).then((data) => {
                return this.sitesProvider.newSite(data.siteUrl, data.token, data.privateToken).then(() => {
                    return this.loginHelper.goToSiteInitialPage();
                }, (error) => {
                    this.loginHelper.treatUserTokenError(siteData.url, error, siteData.username, siteData.password);
                    if (error.loggedout) {
                        this.navCtrl.setRoot('CoreLoginSitesPage');
                    }
                });
            }, (error) => {
                this.loginHelper.treatUserTokenError(siteData.url, error, siteData.username, siteData.password);
                if (error.loggedout) {
                    this.navCtrl.setRoot('CoreLoginSitesPage');
                }
            }).finally(() => {
                modal.dismiss();
            });

        } else {
            // Not a demo site.
            this.sitesProvider.checkSite(url)
                .catch((error) => {
                    // Attempt guessing the domain if the initial check failed
                    const domain = CoreUrl.guessMoodleDomain(url);

                    return domain ? this.sitesProvider.checkSite(domain) : Promise.reject(error);
                })
                .then((result) => this.login(result))
                .catch((error) => this.showLoginIssue(url, error))
                .finally(() => modal.dismiss());
        }
    }

    /**
     * The filter has changed.
     *
     * @param Received Event.
     */
    filterChanged(event: any): void {
        const newValue = event.target.value && event.target.value.trim().toLowerCase();
        if (!newValue || !this.fixedSites) {
            this.filteredSites = this.fixedSites;
        } else {
            this.filteredSites = this.fixedSites.filter((site) => {
                return site.name.toLowerCase().indexOf(newValue) > -1 || site.url.toLowerCase().indexOf(newValue) > -1;
            });
        }
    }

    /**
     * Show a help modal.
     */
    showHelp(): void {
        const modal = this.modalCtrl.create('CoreLoginSiteHelpPage');
        modal.present();
    }

    /**
     * Show an error that aims people to solve the issue.
     *
     * @param url The URL the user was trying to connect to.
     * @param error Error to display.
     */
    protected showLoginIssue(url: string, error: any): void {
        const modal = this.modalCtrl.create('CoreLoginSiteErrorPage', {
            siteUrl: url,
            issue: this.domUtils.getErrorMessage(error)
        });

        modal.present();
    }

    /**
     * Process login to a site.
     *
     * @param response Response obtained from the site check request.
     *
     * @return Promise resolved after logging in.
     */
    protected async login(response: CoreSiteCheckResponse): Promise<void> {
        return this.sitesProvider.checkRequiredMinimumVersion(response.config).then(() => {
            if (response.warning) {
                this.domUtils.showErrorModal(response.warning, true, 4000);
            }

            if (this.loginHelper.isSSOLoginNeeded(response.code)) {
                // SSO. User needs to authenticate in a browser.
                this.loginHelper.confirmAndOpenBrowserForSSOLogin(
                    response.siteUrl, response.code, response.service, response.config && response.config.launchurl);
            } else {
                this.navCtrl.push('CoreLoginCredentialsPage', { siteUrl: response.siteUrl, siteConfig: response.config });
            }
        }).catch(() => {
            // Ignore errors.
        });
    }

}
