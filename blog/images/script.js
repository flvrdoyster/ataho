;(function($) {

	var Area = {};

	Area.Profile = (function() {
		var $areaProfile = $(".area_profile");

		var toggleProfileMenu = function() {
			$areaProfile.toggleClass("on");
		};

		var init = function() {
			$areaProfile.on("click", ".btn_name", toggleProfileMenu);
		};

		return {
			init: init
		}
	})();

	Area.Search = (function() {
		var $areaSearch = $(".area_search"),
			$input = $areaSearch.find(".tf_search");

		var openSearch = function() {
			$areaSearch.addClass("on");
			$input.focus();
		};

		var leaveSearch = function() {
			if ($input.val() == "") {
				$areaSearch.removeClass("on");
			}
		};

		var init = function() {
			$areaSearch.on("click", ".btn_search", openSearch);
			$input.on("blur", leaveSearch);
		};

		return {
			init: init
		}
	})();

	Area.init = function() {
		Area.Profile.init();
		Area.Search.init();
	};

	$.Area = Area;
})(jQuery);