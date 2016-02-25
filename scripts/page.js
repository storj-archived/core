$(function() {

  $('.collapsable').on('click', function(event) {

    // dont toggle collapse on child bubbled events
    var clickedModule =
      $(event.target).closest('ul').hasClass('module-listing');

    if (!clickedModule) return;

    var $li = $(this);
    var collapsed = $li.hasClass('collapsed');

    if (collapsed) {
      $li.removeClass('collapsed');
    } else {
      $li.addClass('collapsed');
    }
  });

});
