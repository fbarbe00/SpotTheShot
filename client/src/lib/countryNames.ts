/**
 * Country name translations by ISO code
 * Used to display country names in the user's language
 * Auto-generated from GeoCLIP admin1_clean.gpkg data
 * Covers all 241 countries/territories from the GeoCLIP database
 *
 * Gender annotations for gendered languages:
 * - French: m (masculin), f (féminin)
 * - Italian: m (maschile), f (femminile)
 * - Spanish: m (masculino), f (femenino)
 * - German: m (maskulin), f (feminin), n (neutrum), pl (plural)
 * - Russian: m (мужской), f (женский), n (средний), pl (множественное)
 */

export type Language = 'en' | 'fr' | 'it' | 'es' | 'de' | 'ru';
export type Gender = 'm' | 'f' | 'n' | 'pl';

export interface CountryTranslation {
  en: string;
  fr: string;
  it: string;
  es: string;
  de: string;
  ru: string;
  gender?: {
    fr?: Gender;
    it?: Gender;
    es?: Gender;
    de?: Gender;
    ru?: Gender;
  };
}

export const COUNTRY_NAMES: Record<string, CountryTranslation> = {
  'AD': { en: 'Andorra', fr: 'Andorre', it: 'Andorra', es: 'Andorra', de: 'Andorra', ru: 'Андорра', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'AE': { en: 'United Arab Emirates', fr: 'Émirats arabes unis', it: 'Emirati Arabi Uniti', es: 'Emiratos Árabes Unidos', de: 'Vereinigte Arabische Emirate', ru: 'ОАЭ', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'm' } },
  'AF': { en: 'Afghanistan', fr: 'Afghanistan', it: 'Afghanistan', es: 'Afganistán', de: 'Afghanistan', ru: 'Афганистан', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'AG': { en: 'Antigua and Barbuda', fr: 'Antigua-et-Barbuda', it: 'Antigua e Barbuda', es: 'Antigua y Barbuda', de: 'Antigua und Barbuda', ru: 'Антигуа и Барбуда', gender: { fr: 'm', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'AI': { en: 'Anguilla', fr: 'Anguilla', it: 'Anguilla', es: 'Anguila', de: 'Anguilla', ru: 'Ангилья', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'AL': { en: 'Albania', fr: 'Albanie', it: 'Albania', es: 'Albania', de: 'Albanien', ru: 'Албания', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'AM': { en: 'Armenia', fr: 'Arménie', it: 'Armenia', es: 'Armenia', de: 'Armenien', ru: 'Армения', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'AO': { en: 'Angola', fr: 'Angola', it: 'Angola', es: 'Angola', de: 'Angola', ru: 'Ангола', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'AQ': { en: 'Antarctica', fr: 'Antarctique', it: 'Antartide', es: 'Antártida', de: 'Antarktis', ru: 'Антарктида', gender: { fr: 'f', it: 'm', es: 'f', de: 'n', ru: 'f' } },
  'AR': { en: 'Argentina', fr: 'Argentine', it: 'Argentina', es: 'Argentina', de: 'Argentinien', ru: 'Аргентина', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'AS': { en: 'American Samoa', fr: 'Samoa américaines', it: 'Samoa Americane', es: 'Samoa Americana', de: 'Amerikanisch-Samoa', ru: 'Американское Самоа', gender: { fr: 'm', it: 'm', es: 'f', de: 'n', ru: 'f' } },
  'AT': { en: 'Austria', fr: 'Autriche', it: 'Austria', es: 'Austria', de: 'Österreich', ru: 'Австрия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'AU': { en: 'Australia', fr: 'Australie', it: 'Australia', es: 'Australia', de: 'Australien', ru: 'Австралия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'AW': { en: 'Aruba', fr: 'Aruba', it: 'Aruba', es: 'Aruba', de: 'Aruba', ru: 'Аруба', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'AX': { en: 'Åland Islands', fr: 'Îles Åland', it: 'Isole Åland', es: 'Islas Åland', de: 'Ålandinseln', ru: 'Аландские острова', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'AZ': { en: 'Azerbaijan', fr: 'Azerbaïdjan', it: 'Azerbaigian', es: 'Azerbaiyán', de: 'Aserbaidschan', ru: 'Азербайджан', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'BA': { en: 'Bosnia and Herzegovina', fr: 'Bosnie-Herzégovine', it: 'Bosnia ed Erzegovina', es: 'Bosnia y Herzegovina', de: 'Bosnien und Herzegowina', ru: 'Босния и Герцеговина', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'BB': { en: 'Barbados', fr: 'Barbade', it: 'Barbados', es: 'Barbados', de: 'Barbados', ru: 'Барбадос', gender: { fr: 'f', it: 'm', es: 'm', de: 'pl', ru: 'f' } },
  'BD': { en: 'Bangladesh', fr: 'Bangladesh', it: 'Bangladesh', es: 'Bangladés', de: 'Bangladesch', ru: 'Бангладеш', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'BE': { en: 'Belgium', fr: 'Belgique', it: 'Belgio', es: 'Bélgica', de: 'Belgien', ru: 'Бельгия', gender: { fr: 'f', it: 'm', es: 'f', de: 'n', ru: 'f' } },
  'BF': { en: 'Burkina Faso', fr: 'Burkina Faso', it: 'Burkina Faso', es: 'Burkina Faso', de: 'Burkina Faso', ru: 'Буркина-Фасо', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'BG': { en: 'Bulgaria', fr: 'Bulgarie', it: 'Bulgaria', es: 'Bulgaria', de: 'Bulgarien', ru: 'Болгария', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'BH': { en: 'Bahrain', fr: 'Bahreïn', it: 'Bahrein', es: 'Baréin', de: 'Bahrain', ru: 'Бахрейн', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'BI': { en: 'Burundi', fr: 'Burundi', it: 'Burundi', es: 'Burundi', de: 'Burundi', ru: 'Бурунди', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'BJ': { en: 'Benin', fr: 'Bénin', it: 'Benin', es: 'Benín', de: 'Benin', ru: 'Бенин', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'BL': { en: 'Saint Barthélemy', fr: 'Saint-Barthélemy', it: 'Saint-Barthélemy', es: 'San Bartolomé', de: 'Saint-Barthélemy', ru: 'Сен-Бартелеми', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'BM': { en: 'Bermuda', fr: 'Bermudes', it: 'Bermuda', es: 'Bermudas', de: 'Bermuda', ru: 'Бермуды', gender: { fr: 'm', it: 'f', es: 'm', de: 'n', ru: 'm' } },
  'BN': { en: 'Brunei', fr: 'Brunei', it: 'Brunei', es: 'Brunéi', de: 'Brunei', ru: 'Бруней', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'BO': { en: 'Bolivia', fr: 'Bolivie', it: 'Bolivia', es: 'Bolivia', de: 'Bolivien', ru: 'Боливия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'BR': { en: 'Brazil', fr: 'Brésil', it: 'Brasile', es: 'Brasil', de: 'Brasilien', ru: 'Бразилия', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'BS': { en: 'Bahamas', fr: 'Bahamas', it: 'Bahamas', es: 'Bahamas', de: 'Bahamas', ru: 'Багамы', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'BT': { en: 'Bhutan', fr: 'Bhoutan', it: 'Bhutan', es: 'Bután', de: 'Bhutan', ru: 'Бутан', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'BV': { en: 'Bouvet Island', fr: 'Île Bouvet', it: 'Isola Bouvet', es: 'Isla Bouvet', de: 'Bouvetinsel', ru: 'Остров Буве', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'n' } },
  'BW': { en: 'Botswana', fr: 'Botswana', it: 'Botswana', es: 'Botsuana', de: 'Botswana', ru: 'Ботсвана', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'BY': { en: 'Belarus', fr: 'Biélorussie', it: 'Bielorussia', es: 'Bielorrusia', de: 'Weißrussland', ru: 'Беларусь', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'BZ': { en: 'Belize', fr: 'Belize', it: 'Belize', es: 'Belice', de: 'Belize', ru: 'Белиз', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'CA': { en: 'Canada', fr: 'Canada', it: 'Canada', es: 'Canadá', de: 'Kanada', ru: 'Канада', gender: { fr: 'm', it: 'f', es: 'm', de: 'n', ru: 'f' } },
  'CC': { en: 'Cocos Islands', fr: 'Îles Cocos', it: 'Isole Cocos', es: 'Islas Cocos', de: 'Kokosinseln', ru: 'Кокосовые острова', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'CD': { en: 'DR Congo', fr: 'RD Congo', it: 'RD del Congo', es: 'RD del Congo', de: 'DR Kongo', ru: 'ДР Конго', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'n' } },
  'CF': { en: 'Central African Republic', fr: 'République centrafricaine', it: 'Repubblica Centrafricana', es: 'República Centroafricana', de: 'Zentralafrikanische Republik', ru: 'ЦАР', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'm' } },
  'CG': { en: 'Republic of the Congo', fr: 'République du Congo', it: 'Repubblica del Congo', es: 'República del Congo', de: 'Republik Kongo', ru: 'Республика Конго', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'CH': { en: 'Switzerland', fr: 'Suisse', it: 'Svizzera', es: 'Suiza', de: 'Schweiz', ru: 'Швейцария', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'CI': { en: 'Côte d\'Ivoire', fr: 'Côte d\'Ivoire', it: 'Costa d\'Avorio', es: 'Costa de Marfil', de: 'Elfenbeinküste', ru: 'Кот-д\'Ивуар' },
  'CK': { en: 'Cook Islands', fr: 'Îles Cook', it: 'Isole Cook', es: 'Islas Cook', de: 'Cookinseln', ru: 'Острова Кука', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'CL': { en: 'Chile', fr: 'Chili', it: 'Cile', es: 'Chile', de: 'Chile', ru: 'Чили', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'CM': { en: 'Cameroon', fr: 'Cameroun', it: 'Camerun', es: 'Camerún', de: 'Kamerun', ru: 'Камерун', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'CN': { en: 'China', fr: 'Chine', it: 'Cina', es: 'China', de: 'China', ru: 'Китай', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'CO': { en: 'Colombia', fr: 'Colombie', it: 'Colombia', es: 'Colombia', de: 'Kolumbien', ru: 'Колумбия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'CR': { en: 'Costa Rica', fr: 'Costa Rica', it: 'Costa Rica', es: 'Costa Rica', de: 'Costa Rica', ru: 'Коста-Рика', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'CU': { en: 'Cuba', fr: 'Cuba', it: 'Cuba', es: 'Cuba', de: 'Kuba', ru: 'Куба', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'CV': { en: 'Cape Verde', fr: 'Cap-Vert', it: 'Capo Verde', es: 'Cabo Verde', de: 'Kap Verde', ru: 'Кабо-Верде', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'CW': { en: 'Curaçao', fr: 'Curaçao', it: 'Curaçao', es: 'Curazao', de: 'Curaçao', ru: 'Кюрасао', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'CX': { en: 'Christmas Island', fr: 'Île Christmas', it: 'Isola Christmas', es: 'Isla de Navidad', de: 'Weihnachtsinsel', ru: 'Остров Рождества', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'f' } },
  'CY': { en: 'Cyprus', fr: 'Chypre', it: 'Cipro', es: 'Chipre', de: 'Zypern', ru: 'Кипр', gender: { fr: 'f', it: 'm', es: 'm', de: 'pl', ru: 'm' } },
  'CZ': { en: 'Czech Republic', fr: 'République tchèque', it: 'Repubblica Ceca', es: 'República Checa', de: 'Tschechien', ru: 'Чехия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'DE': { en: 'Germany', fr: 'Allemagne', it: 'Germania', es: 'Alemania', de: 'Deutschland', ru: 'Германия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'DJ': { en: 'Djibouti', fr: 'Djibouti', it: 'Gibuti', es: 'Yibuti', de: 'Dschibuti', ru: 'Джибути', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'DK': { en: 'Denmark', fr: 'Danemark', it: 'Danimarca', es: 'Dinamarca', de: 'Dänemark', ru: 'Дания', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'DM': { en: 'Dominica', fr: 'Dominique', it: 'Dominica', es: 'Dominica', de: 'Dominica', ru: 'Доминика', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'DO': { en: 'Dominican Republic', fr: 'République dominicaine', it: 'Repubblica Dominicana', es: 'República Dominicana', de: 'Dominikanische Republik', ru: 'Доминиканская Республика', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'DZ': { en: 'Algeria', fr: 'Algérie', it: 'Algeria', es: 'Argelia', de: 'Algerien', ru: 'Алжир', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'm' } },
  'EC': { en: 'Ecuador', fr: 'Équateur', it: 'Ecuador', es: 'Ecuador', de: 'Ecuador', ru: 'Эквадор', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'EE': { en: 'Estonia', fr: 'Estonie', it: 'Estonia', es: 'Estonia', de: 'Estland', ru: 'Эстония', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'EG': { en: 'Egypt', fr: 'Égypte', it: 'Egitto', es: 'Egipto', de: 'Ägypten', ru: 'Египет', gender: { fr: 'f', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'EH': { en: 'Western Sahara', fr: 'Sahara occidental', it: 'Sahara Occidentale', es: 'Sáhara Occidental', de: 'Westsahara', ru: 'Западная Сахара', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'ER': { en: 'Eritrea', fr: 'Érythrée', it: 'Eritrea', es: 'Eritrea', de: 'Eritrea', ru: 'Эритрея', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'ES': { en: 'Spain', fr: 'Espagne', it: 'Spagna', es: 'España', de: 'Spanien', ru: 'Испания', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'ET': { en: 'Ethiopia', fr: 'Éthiopie', it: 'Etiopia', es: 'Etiopía', de: 'Äthiopien', ru: 'Эфиопия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'FI': { en: 'Finland', fr: 'Finlande', it: 'Finlandia', es: 'Finlandia', de: 'Finnland', ru: 'Финляндия', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'FJ': { en: 'Fiji', fr: 'Fidji', it: 'Figi', es: 'Fiyi', de: 'Fidschi', ru: 'Фиджи', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'FK': { en: 'Falkland Islands', fr: 'Îles Malouines', it: 'Isole Falkland', es: 'Islas Malvinas', de: 'Falklandinseln', ru: 'Фолклендские острова', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'FM': { en: 'Micronesia', fr: 'Micronésie', it: 'Micronesia', es: 'Micronesia', de: 'Mikronesien', ru: 'Микронезия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'FO': { en: 'Faroe Islands', fr: 'Îles Féroé', it: 'Isole Fær Øer', es: 'Islas Feroe', de: 'Färöer', ru: 'Фарерские острова', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'FR': { en: 'France', fr: 'France', it: 'Francia', es: 'Francia', de: 'Frankreich', ru: 'Франция', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'GA': { en: 'Gabon', fr: 'Gabon', it: 'Gabon', es: 'Gabón', de: 'Gabun', ru: 'Габон', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'GB': { en: 'United Kingdom', fr: 'Royaume-Uni', it: 'Regno Unito', es: 'Reino Unido', de: 'Vereinigtes Königreich', ru: 'Великобритания', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'GD': { en: 'Grenada', fr: 'Grenade', it: 'Grenada', es: 'Granada', de: 'Grenada', ru: 'Гренада', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'GE': { en: 'Georgia', fr: 'Géorgie', it: 'Georgia', es: 'Georgia', de: 'Georgien', ru: 'Грузия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'GF': { en: 'French Guiana', fr: 'Guyane française', it: 'Guyana francese', es: 'Guayana Francesa', de: 'Französisch-Guayana', ru: 'Французская Гвиана', gender: { fr: 'f', it: 'm', es: 'f', de: 'n', ru: 'f' } },
  'GG': { en: 'Guernsey', fr: 'Guernesey', it: 'Guernsey', es: 'Guernsey', de: 'Guernsey', ru: 'Гернси', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'GH': { en: 'Ghana', fr: 'Ghana', it: 'Ghana', es: 'Ghana', de: 'Ghana', ru: 'Гана', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'GI': { en: 'Gibraltar', fr: 'Gibraltar', it: 'Gibilterra', es: 'Gibraltar', de: 'Gibraltar', ru: 'Гибралтар', gender: { fr: 'm', it: 'f', es: 'm', de: 'n', ru: 'f' } },
  'GL': { en: 'Greenland', fr: 'Groenland', it: 'Groenlandia', es: 'Groenlandia', de: 'Grönland', ru: 'Гренландия', gender: { fr: 'm', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'GM': { en: 'Gambia', fr: 'Gambie', it: 'Gambia', es: 'Gambia', de: 'Gambia', ru: 'Гамбия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'GN': { en: 'Guinea', fr: 'Guinée', it: 'Guinea', es: 'Guinea', de: 'Guinea', ru: 'Гвинея', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'GP': { en: 'Guadeloupe', fr: 'Guadeloupe', it: 'Guadalupa', es: 'Guadalupe', de: 'Guadeloupe', ru: 'Гваделупа', gender: { fr: 'f', it: 'f', es: 'm', de: 'n', ru: 'f' } },
  'GQ': { en: 'Equatorial Guinea', fr: 'Guinée équatoriale', it: 'Guinea Equatoriale', es: 'Guinea Ecuatorial', de: 'Äquatorialguinea', ru: 'Экваториальная Гвинея', gender: { fr: 'f', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'GR': { en: 'Greece', fr: 'Grèce', it: 'Grecia', es: 'Grecia', de: 'Griechenland', ru: 'Греция', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'GS': { en: 'South Georgia', fr: 'Géorgie du Sud', it: 'Georgia del Sud', es: 'Georgia del Sur', de: 'Südgeorgien', ru: 'Южная Георгия', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'GT': { en: 'Guatemala', fr: 'Guatemala', it: 'Guatemala', es: 'Guatemala', de: 'Guatemala', ru: 'Гватемала', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'GU': { en: 'Guam', fr: 'Guam', it: 'Guam', es: 'Guam', de: 'Guam', ru: 'Гуам', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'GW': { en: 'Guinea-Bissau', fr: 'Guinée-Bissau', it: 'Guinea-Bissau', es: 'Guinea-Bisáu', de: 'Guinea-Bissau', ru: 'Гвинея-Бисау', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'GY': { en: 'Guyana', fr: 'Guyana', it: 'Guyana', es: 'Guyana', de: 'Guyana', ru: 'Гайана', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'HK': { en: 'Hong Kong', fr: 'Hong Kong', it: 'Hong Kong', es: 'Hong Kong', de: 'Hongkong', ru: 'Гонконг', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'n' } },
  'HM': { en: 'Heard Island', fr: 'Île Heard', it: 'Isola Heard', es: 'Isla Heard', de: 'Heardinsel', ru: 'Остров Херд', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'n' } },
  'HN': { en: 'Honduras', fr: 'Honduras', it: 'Honduras', es: 'Honduras', de: 'Honduras', ru: 'Гондурас', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'f' } },
  'HR': { en: 'Croatia', fr: 'Croatie', it: 'Croazia', es: 'Croacia', de: 'Kroatien', ru: 'Хорватия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'HT': { en: 'Haiti', fr: 'Haïti', it: 'Haiti', es: 'Haití', de: 'Haiti', ru: 'Гаити', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'HU': { en: 'Hungary', fr: 'Hongrie', it: 'Ungheria', es: 'Hungría', de: 'Ungarn', ru: 'Венгрия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'ID': { en: 'Indonesia', fr: 'Indonésie', it: 'Indonesia', es: 'Indonesia', de: 'Indonesien', ru: 'Индонезия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'IE': { en: 'Ireland', fr: 'Irlande', it: 'Irlanda', es: 'Irlanda', de: 'Irland', ru: 'Ирландия', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'IL': { en: 'Israel', fr: 'Israël', it: 'Israele', es: 'Israel', de: 'Israel', ru: 'Израиль', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'IM': { en: 'Isle of Man', fr: 'Île de Man', it: 'Isola di Man', es: 'Isla de Man', de: 'Isle of Man', ru: 'Остров Мэн', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'n' } },
  'IN': { en: 'India', fr: 'Inde', it: 'India', es: 'India', de: 'Indien', ru: 'Индия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'IO': { en: 'British Indian Ocean Territory', fr: 'Territoire britannique de l\'océan Indien', it: 'Territorio britannico dell\'Oceano Indiano', es: 'Territorio Británico del Océano Índico', de: 'Britisches Territorium im Indischen Ozean', ru: 'Британская территория в Индийском океане' },
  'IQ': { en: 'Iraq', fr: 'Irak', it: 'Iraq', es: 'Irak', de: 'Irak', ru: 'Ирак', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'IR': { en: 'Iran', fr: 'Iran', it: 'Iran', es: 'Irán', de: 'Iran', ru: 'Иран', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'IS': { en: 'Iceland', fr: 'Islande', it: 'Islanda', es: 'Islandia', de: 'Island', ru: 'Исландия', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'IT': { en: 'Italy', fr: 'Italie', it: 'Italia', es: 'Italia', de: 'Italien', ru: 'Италия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'JE': { en: 'Jersey', fr: 'Jersey', it: 'Jersey', es: 'Jersey', de: 'Jersey', ru: 'Джерси', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'JM': { en: 'Jamaica', fr: 'Jamaïque', it: 'Giamaica', es: 'Jamaica', de: 'Jamaika', ru: 'Ямайка', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'JO': { en: 'Jordan', fr: 'Jordanie', it: 'Giordania', es: 'Jordania', de: 'Jordanien', ru: 'Иордания', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'JP': { en: 'Japan', fr: 'Japon', it: 'Giappone', es: 'Japón', de: 'Japan', ru: 'Япония', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'KE': { en: 'Kenya', fr: 'Kenya', it: 'Kenya', es: 'Kenia', de: 'Kenia', ru: 'Кения', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'KG': { en: 'Kyrgyzstan', fr: 'Kirghizistan', it: 'Kirghizistan', es: 'Kirguistán', de: 'Kirgisistan', ru: 'Киргизия', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'KH': { en: 'Cambodia', fr: 'Cambodge', it: 'Cambogia', es: 'Camboya', de: 'Kambodscha', ru: 'Камбоджа', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'KI': { en: 'Kiribati', fr: 'Kiribati', it: 'Kiribati', es: 'Kiribati', de: 'Kiribati', ru: 'Кирибати', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'KM': { en: 'Comoros', fr: 'Comores', it: 'Comore', es: 'Comoras', de: 'Komoren', ru: 'Коморы', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'KN': { en: 'Saint Kitts and Nevis', fr: 'Saint-Christophe-et-Niévès', it: 'Saint Kitts e Nevis', es: 'San Cristóbal y Nieves', de: 'St. Kitts und Nevis', ru: 'Сент-Китс и Невис', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'm' } },
  'KP': { en: 'North Korea', fr: 'Corée du Nord', it: 'Corea del Nord', es: 'Corea del Norte', de: 'Nordkorea', ru: 'Северная Корея', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'KR': { en: 'South Korea', fr: 'Corée du Sud', it: 'Corea del Sud', es: 'Corea del Sur', de: 'Südkorea', ru: 'Южная Корея', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'KW': { en: 'Kuwait', fr: 'Koweït', it: 'Kuwait', es: 'Kuwait', de: 'Kuwait', ru: 'Кувейт', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'KY': { en: 'Cayman Islands', fr: 'Îles Caïmans', it: 'Isole Cayman', es: 'Islas Caimán', de: 'Kaimaninseln', ru: 'Каймановы острова', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'KZ': { en: 'Kazakhstan', fr: 'Kazakhstan', it: 'Kazakistan', es: 'Kazajistán', de: 'Kasachstan', ru: 'Казахстан', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'LA': { en: 'Laos', fr: 'Laos', it: 'Laos', es: 'Laos', de: 'Laos', ru: 'Лаос', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'f' } },
  'LB': { en: 'Lebanon', fr: 'Liban', it: 'Libano', es: 'Líbano', de: 'Libanon', ru: 'Ливан', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'LC': { en: 'Saint Lucia', fr: 'Sainte-Lucie', it: 'Santa Lucia', es: 'Santa Lucía', de: 'St. Lucia', ru: 'Сент-Люсия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'LI': { en: 'Liechtenstein', fr: 'Liechtenstein', it: 'Liechtenstein', es: 'Liechtenstein', de: 'Liechtenstein', ru: 'Лихтенштейн', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'LK': { en: 'Sri Lanka', fr: 'Sri Lanka', it: 'Sri Lanka', es: 'Sri Lanka', de: 'Sri Lanka', ru: 'Шри-Ланка', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'LR': { en: 'Liberia', fr: 'Libéria', it: 'Liberia', es: 'Liberia', de: 'Liberia', ru: 'Либерия', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'LS': { en: 'Lesotho', fr: 'Lesotho', it: 'Lesotho', es: 'Lesoto', de: 'Lesotho', ru: 'Лесото', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'n' } },
  'LT': { en: 'Lithuania', fr: 'Lituanie', it: 'Lituania', es: 'Lituania', de: 'Litauen', ru: 'Литва', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'LU': { en: 'Luxembourg', fr: 'Luxembourg', it: 'Lussemburgo', es: 'Luxemburgo', de: 'Luxemburg', ru: 'Люксембург', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'LV': { en: 'Latvia', fr: 'Lettonie', it: 'Lettonia', es: 'Letonia', de: 'Lettland', ru: 'Латвия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'LY': { en: 'Libya', fr: 'Libye', it: 'Libia', es: 'Libia', de: 'Libyen', ru: 'Ливия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'MA': { en: 'Morocco', fr: 'Maroc', it: 'Marocco', es: 'Marruecos', de: 'Marokko', ru: 'Марокко', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'MC': { en: 'Monaco', fr: 'Monaco', it: 'Monaco', es: 'Mónaco', de: 'Monaco', ru: 'Монако', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'MD': { en: 'Moldova', fr: 'Moldavie', it: 'Moldavia', es: 'Moldavia', de: 'Moldau', ru: 'Молдавия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'ME': { en: 'Montenegro', fr: 'Monténégro', it: 'Montenegro', es: 'Montenegro', de: 'Montenegro', ru: 'Черногория', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'MF': { en: 'Saint Martin', fr: 'Saint-Martin', it: 'Saint-Martin', es: 'San Martín', de: 'Saint-Martin', ru: 'Сен-Мартен', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'MG': { en: 'Madagascar', fr: 'Madagascar', it: 'Madagascar', es: 'Madagascar', de: 'Madagaskar', ru: 'Мадагаскар', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'MH': { en: 'Marshall Islands', fr: 'Îles Marshall', it: 'Isole Marshall', es: 'Islas Marshall', de: 'Marshallinseln', ru: 'Маршалловы Острова', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'MK': { en: 'North Macedonia', fr: 'Macédoine du Nord', it: 'Macedonia del Nord', es: 'Macedonia del Norte', de: 'Nordmazedonien', ru: 'Северная Македония', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'ML': { en: 'Mali', fr: 'Mali', it: 'Mali', es: 'Malí', de: 'Mali', ru: 'Мали', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'MM': { en: 'Myanmar', fr: 'Myanmar', it: 'Myanmar', es: 'Myanmar', de: 'Myanmar', ru: 'Мьянма', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'MN': { en: 'Mongolia', fr: 'Mongolie', it: 'Mongolia', es: 'Mongolia', de: 'Mongolei', ru: 'Монголия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'MO': { en: 'Macau', fr: 'Macao', it: 'Macao', es: 'Macao', de: 'Macau', ru: 'Макао', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'MP': { en: 'Northern Mariana Islands', fr: 'Îles Mariannes du Nord', it: 'Isole Marianne Settentrionali', es: 'Islas Marianas del Norte', de: 'Nördliche Marianen', ru: 'Северные Марианские острова', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'MQ': { en: 'Martinique', fr: 'Martinique', it: 'Martinica', es: 'Martinica', de: 'Martinique', ru: 'Мартиника', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'MR': { en: 'Mauritania', fr: 'Mauritanie', it: 'Mauritania', es: 'Mauritania', de: 'Mauretanien', ru: 'Мавритания', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'MS': { en: 'Montserrat', fr: 'Montserrat', it: 'Montserrat', es: 'Montserrat', de: 'Montserrat', ru: 'Монтсеррат', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'MT': { en: 'Malta', fr: 'Malte', it: 'Malta', es: 'Malta', de: 'Malta', ru: 'Мальта', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'MU': { en: 'Mauritius', fr: 'Maurice', it: 'Mauritius', es: 'Mauricio', de: 'Mauritius', ru: 'Маврикий', gender: { fr: 'f', it: 'm', es: 'm', de: 'pl', ru: 'f' } },
  'MV': { en: 'Maldives', fr: 'Maldives', it: 'Maldive', es: 'Maldivas', de: 'Malediven', ru: 'Мальдивы', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'MW': { en: 'Malawi', fr: 'Malawi', it: 'Malawi', es: 'Malaui', de: 'Malawi', ru: 'Малави', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'MX': { en: 'Mexico', fr: 'Mexique', it: 'Messico', es: 'México', de: 'Mexiko', ru: 'Мексика', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'MY': { en: 'Malaysia', fr: 'Malaisie', it: 'Malesia', es: 'Malasia', de: 'Malaysia', ru: 'Малайзия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'MZ': { en: 'Mozambique', fr: 'Mozambique', it: 'Mozambico', es: 'Mozambique', de: 'Mosambik', ru: 'Мозамбик', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'NA': { en: 'Namibia', fr: 'Namibie', it: 'Namibia', es: 'Namibia', de: 'Namibia', ru: 'Намибия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'NC': { en: 'New Caledonia', fr: 'Nouvelle-Calédonie', it: 'Nuova Caledonia', es: 'Nueva Caledonia', de: 'Neukaledonien', ru: 'Новая Каледония', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'NE': { en: 'Niger', fr: 'Niger', it: 'Niger', es: 'Níger', de: 'Niger', ru: 'Нигер', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'NF': { en: 'Norfolk Island', fr: 'Île Norfolk', it: 'Isola Norfolk', es: 'Isla Norfolk', de: 'Norfolkinsel', ru: 'Остров Норфолк', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'n' } },
  'NG': { en: 'Nigeria', fr: 'Nigéria', it: 'Nigeria', es: 'Nigeria', de: 'Nigeria', ru: 'Нигерия', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'NI': { en: 'Nicaragua', fr: 'Nicaragua', it: 'Nicaragua', es: 'Nicaragua', de: 'Nicaragua', ru: 'Никарагуа', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'NL': { en: 'Netherlands', fr: 'Pays-Bas', it: 'Paesi Bassi', es: 'Países Bajos', de: 'Niederlande', ru: 'Нидерланды', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'NO': { en: 'Norway', fr: 'Norvège', it: 'Norvegia', es: 'Noruega', de: 'Norwegen', ru: 'Норвегия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'NP': { en: 'Nepal', fr: 'Népal', it: 'Nepal', es: 'Nepal', de: 'Nepal', ru: 'Непал', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'NR': { en: 'Nauru', fr: 'Nauru', it: 'Nauru', es: 'Nauru', de: 'Nauru', ru: 'Науру', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'NU': { en: 'Niue', fr: 'Niue', it: 'Niue', es: 'Niue', de: 'Niue', ru: 'Niue', gender: { fr: 'f', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'NZ': { en: 'New Zealand', fr: 'Nouvelle-Zélande', it: 'Nuova Zelanda', es: 'Nueva Zelanda', de: 'Neuseeland', ru: 'Новая Зеландия', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'OM': { en: 'Oman', fr: 'Oman', it: 'Oman', es: 'Omán', de: 'Oman', ru: 'Оман', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'PA': { en: 'Panama', fr: 'Panama', it: 'Panama', es: 'Panamá', de: 'Panama', ru: 'Панама', gender: { fr: 'm', it: 'f', es: 'm', de: 'n', ru: 'f' } },
  'PE': { en: 'Peru', fr: 'Pérou', it: 'Perù', es: 'Perú', de: 'Peru', ru: 'Перу', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'PF': { en: 'French Polynesia', fr: 'Polynésie française', it: 'Polinesia francese', es: 'Polinesia Francesa', de: 'Französisch-Polynesien', ru: 'Французская Полинезия', gender: { fr: 'f', it: 'm', es: 'f', de: 'n', ru: 'f' } },
  'PG': { en: 'Papua New Guinea', fr: 'Papouasie-Nouvelle-Guinée', it: 'Papua Nuova Guinea', es: 'Papúa Nueva Guinea', de: 'Papua-Neuguinea', ru: 'Папуа — Новая Гвинея', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'PH': { en: 'Philippines', fr: 'Philippines', it: 'Filippine', es: 'Filipinas', de: 'Philippinen', ru: 'Филиппины', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'PK': { en: 'Pakistan', fr: 'Pakistan', it: 'Pakistan', es: 'Pakistán', de: 'Pakistan', ru: 'Пакистан', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'PL': { en: 'Poland', fr: 'Pologne', it: 'Polonia', es: 'Polonia', de: 'Polen', ru: 'Польша', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'PM': { en: 'Saint Pierre and Miquelon', fr: 'Saint-Pierre-et-Miquelon', it: 'Saint-Pierre e Miquelon', es: 'San Pedro y Miquelón', de: 'Saint-Pierre und Miquelon', ru: 'Сен-Пьер и Микелон', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'n' } },
  'PN': { en: 'Pitcairn Islands', fr: 'Îles Pitcairn', it: 'Isole Pitcairn', es: 'Islas Pitcairn', de: 'Pitcairninseln', ru: 'Острова Питкэрн', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'PR': { en: 'Puerto Rico', fr: 'Porto Rico', it: 'Porto Rico', es: 'Puerto Rico', de: 'Puerto Rico', ru: 'Пуэрто-Рико', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'n' } },
  'PS': { en: 'Palestine', fr: 'Palestine', it: 'Palestina', es: 'Palestina', de: 'Palästina', ru: 'Палестина', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'PT': { en: 'Portugal', fr: 'Portugal', it: 'Portogallo', es: 'Portugal', de: 'Portugal', ru: 'Португалия', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'PW': { en: 'Palau', fr: 'Palaos', it: 'Palau', es: 'Palaos', de: 'Palau', ru: 'Палау', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'PY': { en: 'Paraguay', fr: 'Paraguay', it: 'Paraguay', es: 'Paraguay', de: 'Paraguay', ru: 'Парагвай', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'QA': { en: 'Qatar', fr: 'Qatar', it: 'Qatar', es: 'Catar', de: 'Katar', ru: 'Катар', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'RE': { en: 'Réunion', fr: 'La Réunion', it: 'Riunione', es: 'Reunión', de: 'Réunion', ru: 'Реюньон', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'n' } },
  'RO': { en: 'Romania', fr: 'Roumanie', it: 'Romania', es: 'Rumania', de: 'Rumänien', ru: 'Румыния', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'RS': { en: 'Serbia', fr: 'Serbie', it: 'Serbia', es: 'Serbia', de: 'Serbien', ru: 'Сербия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'RU': { en: 'Russia', fr: 'Russie', it: 'Russia', es: 'Rusia', de: 'Russland', ru: 'Россия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'RW': { en: 'Rwanda', fr: 'Rwanda', it: 'Ruanda', es: 'Ruanda', de: 'Ruanda', ru: 'Руанда', gender: { fr: 'm', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'SA': { en: 'Saudi Arabia', fr: 'Arabie saoudite', it: 'Arabia Saudita', es: 'Arabia Saudí', de: 'Saudi-Arabien', ru: 'Саудовская Аравия', gender: { fr: 'f', it: 'f', es: 'm', de: 'n', ru: 'f' } },
  'SB': { en: 'Solomon Islands', fr: 'Îles Salomon', it: 'Isole Salomone', es: 'Islas Salomón', de: 'Salomonen', ru: 'Соломоновы Острова', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'SC': { en: 'Seychelles', fr: 'Seychelles', it: 'Seychelles', es: 'Seychelles', de: 'Seychellen', ru: 'Сейшельские Острова', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'SD': { en: 'Sudan', fr: 'Soudan', it: 'Sudan', es: 'Sudán', de: 'Sudan', ru: 'Судан', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'SE': { en: 'Sweden', fr: 'Suède', it: 'Svezia', es: 'Suecia', de: 'Schweden', ru: 'Швеция', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'SG': { en: 'Singapore', fr: 'Singapour', it: 'Singapore', es: 'Singapur', de: 'Singapur', ru: 'Сингапур', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'SH': { en: 'Saint Helena', fr: 'Sainte-Hélène', it: 'Sant\'Elena', es: 'Santa Elena', de: 'St. Helena', ru: 'Остров Святой Елены' },
  'SI': { en: 'Slovenia', fr: 'Slovénie', it: 'Slovenia', es: 'Eslovenia', de: 'Slowenien', ru: 'Словения', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'SJ': { en: 'Svalbard and Jan Mayen', fr: 'Svalbard et Jan Mayen', it: 'Svalbard e Jan Mayen', es: 'Svalbard y Jan Mayen', de: 'Spitzbergen und Jan Mayen', ru: 'Шпицберген и Ян-Майен', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'f' } },
  'SK': { en: 'Slovakia', fr: 'Slovaquie', it: 'Slovacchia', es: 'Eslovaquia', de: 'Slowakei', ru: 'Словакия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'SL': { en: 'Sierra Leone', fr: 'Sierra Leone', it: 'Sierra Leone', es: 'Sierra Leona', de: 'Sierra Leone', ru: 'Сьерра-Леоне', gender: { fr: 'f', it: 'm', es: 'f', de: 'n', ru: 'f' } },
  'SM': { en: 'San Marino', fr: 'Saint-Marin', it: 'San Marino', es: 'San Marino', de: 'San Marino', ru: 'Сан-Марино', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'SN': { en: 'Senegal', fr: 'Sénégal', it: 'Senegal', es: 'Senegal', de: 'Senegal', ru: 'Сенегал', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'SO': { en: 'Somalia', fr: 'Somalie', it: 'Somalia', es: 'Somalia', de: 'Somalia', ru: 'Сомали', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'SR': { en: 'Suriname', fr: 'Suriname', it: 'Suriname', es: 'Surinam', de: 'Suriname', ru: 'Суринам', gender: { fr: 'f', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'SS': { en: 'South Sudan', fr: 'Soudan du Sud', it: 'Sudan del Sud', es: 'Sudán del Sur', de: 'Südsudan', ru: 'Южный Судан', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'ST': { en: 'São Tomé and Príncipe', fr: 'Sao Tomé-et-Principe', it: 'São Tomé e Príncipe', es: 'Santo Tomé y Príncipe', de: 'São Tomé und Príncipe', ru: 'Сан-Томе и Принсипи', gender: { fr: 'f', it: 'm', es: 'm', de: 'pl', ru: 'f' } },
  'SV': { en: 'El Salvador', fr: 'Salvador', it: 'El Salvador', es: 'El Salvador', de: 'El Salvador', ru: 'Сальвадор', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'SX': { en: 'Sint Maarten', fr: 'Saint-Martin', it: 'Sint Maarten', es: 'Sint Maarten', de: 'Sint Maarten', ru: 'Синт-Мартен', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'SY': { en: 'Syria', fr: 'Syrie', it: 'Siria', es: 'Siria', de: 'Syrien', ru: 'Сирия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'SZ': { en: 'Eswatini', fr: 'Eswatini', it: 'Eswatini', es: 'Esuatini', de: 'Eswatini', ru: 'Эсватини', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'TC': { en: 'Turks and Caicos Islands', fr: 'Îles Turques-et-Caïques', it: 'Isole Turks e Caicos', es: 'Islas Turcas y Caicos', de: 'Turks- und Caicosinseln', ru: 'Острова Теркс и Кайкос', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'TD': { en: 'Chad', fr: 'Tchad', it: 'Ciad', es: 'Chad', de: 'Tschad', ru: 'Чад', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'TF': { en: 'French Southern Territories', fr: 'Terres australes françaises', it: 'Terre australi francesi', es: 'Tierras Australes Francesas', de: 'Französische Süd- und Antarktisgebiete', ru: 'Французские Южные территории', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'f' } },
  'TG': { en: 'Togo', fr: 'Togo', it: 'Togo', es: 'Togo', de: 'Togo', ru: 'Того', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'n' } },
  'TH': { en: 'Thailand', fr: 'Thaïlande', it: 'Tailandia', es: 'Tailandia', de: 'Thailand', ru: 'Таиланд', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'TJ': { en: 'Tajikistan', fr: 'Tadjikistan', it: 'Tagikistan', es: 'Tayikistán', de: 'Tadschikistan', ru: 'Таджикистан', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'TK': { en: 'Tokelau', fr: 'Tokelau', it: 'Tokelau', es: 'Tokelau', de: 'Tokelau', ru: 'Токелау', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'TL': { en: 'Timor-Leste', fr: 'Timor oriental', it: 'Timor Est', es: 'Timor Oriental', de: 'Osttimor', ru: 'Восточный Тимор', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'n' } },
  'TM': { en: 'Turkmenistan', fr: 'Turkménistan', it: 'Turkmenistan', es: 'Turkmenistán', de: 'Turkmenistan', ru: 'Туркменистан', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'TN': { en: 'Tunisia', fr: 'Tunisie', it: 'Tunisia', es: 'Túnez', de: 'Tunesien', ru: 'Тунис', gender: { fr: 'f', it: 'f', es: 'm', de: 'n', ru: 'm' } },
  'TO': { en: 'Tonga', fr: 'Tonga', it: 'Tonga', es: 'Tonga', de: 'Tonga', ru: 'Тонга', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'TR': { en: 'Turkey', fr: 'Turquie', it: 'Turchia', es: 'Turquía', de: 'Türkei', ru: 'Турция', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'TT': { en: 'Trinidad and Tobago', fr: 'Trinité-et-Tobago', it: 'Trinidad e Tobago', es: 'Trinidad y Tobago', de: 'Trinidad und Tobago', ru: 'Тринидад и Тобаго', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'f' } },
  'TV': { en: 'Tuvalu', fr: 'Tuvalu', it: 'Tuvalu', es: 'Tuvalu', de: 'Tuvalu', ru: 'Тувалу', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'TW': { en: 'Taiwan', fr: 'Taïwan', it: 'Taiwan', es: 'Taiwán', de: 'Taiwan', ru: 'Тайвань', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'TZ': { en: 'Tanzania', fr: 'Tanzanie', it: 'Tanzania', es: 'Tanzania', de: 'Tansania', ru: 'Танзания', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'UA': { en: 'Ukraine', fr: 'Ukraine', it: 'Ucraina', es: 'Ucrania', de: 'Ukraine', ru: 'Украина', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'UG': { en: 'Uganda', fr: 'Ouganda', it: 'Uganda', es: 'Uganda', de: 'Uganda', ru: 'Уганда', gender: { fr: 'm', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'UM': { en: 'United States Minor Outlying Islands', fr: 'Îles mineures éloignées des États-Unis', it: 'Isole minori esterne degli Stati Uniti', es: 'Islas menores alejadas de los Estados Unidos', de: 'Amerikanische Überseeinseln', ru: 'Внешние малые острова США', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'US': { en: 'United States', fr: 'États-Unis', it: 'Stati Uniti', es: 'Estados Unidos', de: 'Vereinigte Staaten', ru: 'США', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'UY': { en: 'Uruguay', fr: 'Uruguay', it: 'Uruguay', es: 'Uruguay', de: 'Uruguay', ru: 'Уругвай', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'UZ': { en: 'Uzbekistan', fr: 'Ouzbékistan', it: 'Uzbekistan', es: 'Uzbekistán', de: 'Usbekistan', ru: 'Узбекистан', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'VA': { en: 'Vatican City', fr: 'Vatican', it: 'Città del Vaticano', es: 'Ciudad del Vaticano', de: 'Vatikanstadt', ru: 'Ватикан', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'VC': { en: 'Saint Vincent and the Grenadines', fr: 'Saint-Vincent-et-les-Grenadines', it: 'Saint Vincent e Grenadine', es: 'San Vicente y las Granadinas', de: 'St. Vincent und die Grenadinen', ru: 'Сент-Винсент и Гренадины', gender: { fr: 'm', it: 'm', es: 'm', de: 'pl', ru: 'f' } },
  'VE': { en: 'Venezuela', fr: 'Venezuela', it: 'Venezuela', es: 'Venezuela', de: 'Venezuela', ru: 'Венесуэла', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'VG': { en: 'British Virgin Islands', fr: 'Îles Vierges britanniques', it: 'Isole Vergini Britanniche', es: 'Islas Vírgenes Británicas', de: 'Britische Jungferninseln', ru: 'Британские Виргинские острова', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'VI': { en: 'United States Virgin Islands', fr: 'Îles Vierges des États-Unis', it: 'Isole Vergini Americane', es: 'Islas Vírgenes de los Estados Unidos', de: 'Amerikanische Jungferninseln', ru: 'Виргинские Острова США', gender: { fr: 'f', it: 'f', es: 'f', de: 'pl', ru: 'pl' } },
  'VN': { en: 'Vietnam', fr: 'Viêt Nam', it: 'Vietnam', es: 'Vietnam', de: 'Vietnam', ru: 'Вьетнам', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'VU': { en: 'Vanuatu', fr: 'Vanuatu', it: 'Vanuatu', es: 'Vanuatu', de: 'Vanuatu', ru: 'Вануату', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'WF': { en: 'Wallis and Futuna', fr: 'Wallis-et-Futuna', it: 'Wallis e Futuna', es: 'Wallis y Futuna', de: 'Wallis und Futuna', ru: 'Уоллис и Футуна', gender: { fr: 'm', it: 'f', es: 'f', de: 'pl', ru: 'f' } },
  'WS': { en: 'Samoa', fr: 'Samoa', it: 'Samoa', es: 'Samoa', de: 'Samoa', ru: 'Самоа', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'XK': { en: 'Kosovo', fr: 'Kosovo', it: 'Kosovo', es: 'Kosovo', de: 'Kosovo', ru: 'Косово', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'n' } },
  'YE': { en: 'Yemen', fr: 'Yémen', it: 'Yemen', es: 'Yemen', de: 'Jemen', ru: 'Йемен', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'm' } },
  'YT': { en: 'Mayotte', fr: 'Mayotte', it: 'Mayotte', es: 'Mayotte', de: 'Mayotte', ru: 'Майотта', gender: { fr: 'f', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  'ZA': { en: 'South Africa', fr: 'Afrique du Sud', it: 'Sudafrica', es: 'Sudáfrica', de: 'Südafrika', ru: 'ЮАР', gender: { fr: 'm', it: 'f', es: 'f', de: 'n', ru: 'm' } },
  'ZM': { en: 'Zambia', fr: 'Zambie', it: 'Zambia', es: 'Zambia', de: 'Sambia', ru: 'Замбия', gender: { fr: 'f', it: 'f', es: 'f', de: 'n', ru: 'f' } },
  'ZW': { en: 'Zimbabwe', fr: 'Zimbabwe', it: 'Zimbabwe', es: 'Zimbabue', de: 'Simbabwe', ru: 'Зимбабве', gender: { fr: 'm', it: 'm', es: 'm', de: 'n', ru: 'f' } },
  // Default fallback for unknown countries
  'UNKNOWN': { en: 'Unknown', fr: 'Inconnu', it: 'Sconosciuto', es: 'Desconocido', de: 'Unbekannt', ru: 'Неизвестно' }
};

/**
 * Get translated country name by ISO code
 * @param isoCode - ISO 3166-1 alpha-2 country code (e.g., 'FR', 'US')
 * @param language - Target language code
 * @param fallbackName - Optional English country name to use if translation not found
 * @returns Translated country name or fallback
 */
export function getCountryName(
  isoCode: string | null | undefined,
  language: Language = 'en',
  fallbackName?: string
): string {
  if (!isoCode) return fallbackName || COUNTRY_NAMES.UNKNOWN![language];
  
  const code = isoCode.toUpperCase();
  const translations = COUNTRY_NAMES[code];

  if (translations) {
    return translations[language] || translations.en;
  }

  // Return fallback if provided, otherwise return English name or code
  return fallbackName || code;
}

/**
 * Get grammatical gender for a country in a specific language
 * @param isoCode - ISO 3166-1 alpha-2 country code
 * @param language - Target language code (not applicable for English)
 * @returns Gender ('m', 'f', 'n', 'pl') or undefined if not available
 */
export function getCountryGender(
  isoCode: string | null | undefined,
  language: Language
): Gender | undefined {
  // English doesn't have grammatical gender
  if (language === 'en') return undefined;
  if (!isoCode) return undefined;

  const code = isoCode.toUpperCase();
  const translations = COUNTRY_NAMES[code];

  if (translations && translations.gender) {
    return translations.gender[language];
  }

  return undefined;
}
